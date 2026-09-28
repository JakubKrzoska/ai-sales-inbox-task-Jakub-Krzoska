import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { extractForMessage, extractRequestSchema } from "./ai.js";
import { prisma } from "./db.js";

const app = express();
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "client");

app.use(express.json());

app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
  if (
    request.path.startsWith("/api/") &&
    error &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    response.status(400).json({ error: "invalid_json" });
    return;
  }
  next(error);
});

function serializeMessage(message: { id: string; senderName: string; senderEmail: string; company: string; subject: string; body: string; createdAt: Date }) {
  return {
    id: message.id,
    senderName: message.senderName,
    senderEmail: message.senderEmail,
    company: message.company,
    subject: message.subject,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

async function handleMessages(_request: Request, response: Response, next: NextFunction) {
  try {
    const records = await prisma.message.findMany({
      orderBy: { createdAt: "desc" },
    });
    const messages = records.map(serializeMessage);
    response.json(messages);
  } catch (error) {
    next(error);
  }
}

app.get("/api/messages", handleMessages);
app.get("/api/messages/:messageId", async (request, response, next) => {
  try {
    const record = await prisma.message.findUnique({ where: { id: request.params.messageId } });
    if (!record) {
      response.status(404).json({ error: "message_not_found" });
      return;
    }
    response.json(serializeMessage(record));
  } catch (error) {
    next(error);
  }
});

function serializeLead(lead: {
  id: string;
  sourceMessageId: string;
  product: string;
  quantity: number;
  material: string | null;
  budget: number | null;
  status: string;
  createdAt: Date;
}) {
  return {
    ...lead,
    createdAt: lead.createdAt.toISOString(),
  };
}

const createLeadSchema = z.object({
  sourceMessageId: z.string().trim().min(1, "sourceMessageId is required"),
  product: z.string().trim().min(1, "product cannot be empty"),
  quantity: z.number().int("quantity must be an integer").positive("quantity must be positive"),
  material: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val && val.trim() ? val.trim() : null)),
  budget: z.number().finite().nonnegative("budget must be non-negative").nullable().optional(),
  status: z.string().optional(),
});

app.get("/api/leads", async (_request, response, next) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: "asc" } });
    response.json(leads.map(serializeLead));
  } catch (error) {
    next(error);
  }
});

app.post("/api/leads", async (request, response, next) => {
  try {
    const parsed = createLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }

    const { sourceMessageId, product, quantity, material, budget } = parsed.data;

    const sourceMessage = await prisma.message.findUnique({
      where: { id: sourceMessageId },
    });
    if (!sourceMessage) {
      response.status(404).json({ error: "message_not_found" });
      return;
    }

    const lead = await prisma.lead.create({
      data: {
        id: crypto.randomUUID(),
        sourceMessageId,
        product,
        quantity,
        material: material ?? null,
        budget: budget ?? null,
        status: "NEW",
      },
    });

    response.status(201).json(serializeLead(lead));
  } catch (error) {
    next(error);
  }
});

const updateLeadStatusSchema = z
  .object({
    status: z.literal("CONTACTED"),
  })
  .strict();

app.patch("/api/leads/:leadId/status", async (request, response, next) => {
  try {
    const parsed = updateLeadStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }

    const leadId = request.params.leadId;
    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!existingLead) {
      response.status(404).json({ error: "lead_not_found" });
      return;
    }

    if (existingLead.status !== "NEW") {
      response.status(400).json({ error: "invalid_status_transition" });
      return;
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: { status: parsed.data.status },
    });

    response.json(serializeLead(updatedLead));
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/extract", async (request, response, next) => {
  try {
    const parsed = extractRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }

    const message = await prisma.message.findUnique({ where: { id: parsed.data } });
    if (!message) {
      response.status(404).json({ error: "message_not_found" });
      return;
    }

    if (parsed.data === "message-failure") {
      response.status(500).json({ error: "EXTRACTION_FAILED" });
      return;
    }

    const extraction = extractForMessage(parsed.data);
    if (!extraction) {
      response.json({});
      return;
    }
    response.json(extraction);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(clientDir));

app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/")) {
    response.status(404).json({ error: "not_found" });
    return;
  }
  response.sendFile(path.join(clientDir, "index.html"), (error) => (error ? next(error) : undefined));
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "internal_server_error" });
});

export { app };
