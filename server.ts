import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fsSync from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const PORT = 3000;

function getFirebaseApiKey(): string {
  try {
    const raw = fsSync.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { apiKey?: string };
    return parsed.apiKey || '';
  } catch {
    return '';
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Login obrigatório para realizar esta ação.' });
  }

  const apiKey = getFirebaseApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: 'Configuração de autenticação Firebase ausente.' });
  }

  try {
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      },
    );
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
    }
    const data = (await verifyRes.json()) as { users?: { localId: string; email?: string }[] };
    if (!data.users || data.users.length === 0) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Não foi possível validar sua sessão.' });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Extract utility company PDF report data using Gemini (client matching runs on the user's isolated Firestore state)
  app.post('/api/import-utility-pdf', requireAuth, async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body as {
        fileBase64?: string;
        mimeType?: string;
      };
      if (!fileBase64) {
        return res.status(400).json({ error: 'Arquivo PDF não enviado.' });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'Chave da API Gemini não configurada no servidor (Settings > Secrets).',
        });
      }

      const pdfPart = {
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: fileBase64,
        },
      };

      const promptPart = {
        text:
          'Você é um especialista em faturas e relatórios de compensação de energia solar (SCEE / Geração Distribuída) emitidos por concessionárias de energia brasileiras (CPFL, Cemig, Enel, Equatorial, Energisa, Light, Neoenergia, Copel, Celesc). ' +
          'Leia o documento PDF anexo e extraia com precisão: ' +
          '1) Os dados do cliente e da unidade consumidora (UC); ' +
          '2) O mês de referência principal (formato YYYY-MM), a data de vencimento (YYYY-MM-DD), o consumo total em kWh, a energia solar compensada/injetada em kWh e o valor total equivalente sem desconto solar em reais; ' +
          '3) Caso o PDF contenha um quadro ou tabela de histórico de consumo de meses anteriores, extraia todos os meses encontrados no array historicalConsumption (mês YYYY-MM, consumedKwh e compensatedKwh). ' +
          'Se algum campo não estiver explícito no documento, retorne string vazia para texto, array vazio para historicalConsumption ou 0 para números (não invente CPF/CNPJ ou UC inexistentes).',
      };

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts: [pdfPart, promptPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              utilityCompany: {
                type: Type.STRING,
                description: 'Nome da concessionária emissora do relatório ou fatura.',
              },
              clientName: {
                type: Type.STRING,
                description: 'Nome completo ou razão social do titular da conta.',
              },
              document: {
                type: Type.STRING,
                description: 'CPF ou CNPJ do titular.',
              },
              ucNumber: {
                type: Type.STRING,
                description: 'Número da Unidade Consumidora (UC) ou código de instalação.',
              },
              city: {
                type: Type.STRING,
                description: 'Cidade e UF do endereço de instalação, ex: Ribeirão Preto / SP.',
              },
              email: {
                type: Type.STRING,
                description: 'E-mail do cliente se constar no documento.',
              },
              phone: {
                type: Type.STRING,
                description: 'Telefone do cliente se constar no documento.',
              },
              referenceMonth: {
                type: Type.STRING,
                description: 'Mês de referência no formato YYYY-MM (ex: 2026-11).',
              },
              dueDate: {
                type: Type.STRING,
                description: 'Data de vencimento no formato YYYY-MM-DD.',
              },
              consumedKwh: {
                type: Type.NUMBER,
                description: 'Consumo total de energia elétrica medido no período principal em kWh.',
              },
              compensatedKwh: {
                type: Type.NUMBER,
                description: 'Quantidade de energia compensada / créditos solares injetados no período principal em kWh.',
              },
              gridCostWithoutSolar: {
                type: Type.NUMBER,
                description: 'Valor total em reais (R$) que seria cobrado sem o desconto da usina solar.',
              },
              historicalConsumption: {
                type: Type.ARRAY,
                description: 'Lista de meses adicionais encontrados na tabela de histórico de consumo do PDF.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    month: {
                      type: Type.STRING,
                      description: 'Mês no formato YYYY-MM.',
                    },
                    consumedKwh: {
                      type: Type.NUMBER,
                      description: 'Consumo medido em kWh neste mês.',
                    },
                    compensatedKwh: {
                      type: Type.NUMBER,
                      description: 'Energia compensada em kWh neste mês (se constar, senão 0).',
                    },
                  },
                },
              },
              observations: {
                type: Type.STRING,
                description: 'Resumo curto em português dos principais dados lidos no documento.',
              },
            },
          },
        },
      });

      const extracted = JSON.parse((response.text ?? '{}').trim());
      res.json({ extracted });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao processar o PDF da concessionária.';
      res.status(500).json({ error: `Falha ao extrair dados do PDF: ${message}` });
    }
  });

  // Vite middleware in dev / static files in prod
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sertão Solar server running on http://localhost:${PORT}`);
  });
}

startServer();
