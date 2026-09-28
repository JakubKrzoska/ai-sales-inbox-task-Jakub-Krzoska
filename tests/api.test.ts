import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../server/app.js";
import { prisma } from "../server/db.js";

describe("InboxIQ API", () => {
  it("returns exactly the four seed messages as raw Message objects", async () => {
    const response = await request(app).get("/api/messages");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    expect(response.body.map((message: { id: string }) => message.id)).toEqual([
      "message-perfect",
      "message-partial",
      "message-failure",
      "message-empty",
    ]);
    expect(response.body[0]).toEqual(expect.objectContaining({ company: "Acme", createdAt: expect.any(String) }));
    expect(response.body[0]).not.toHaveProperty("tags");
  });

  it("returns a raw message detail and no list alias", async () => {
    const detail = await request(app).get("/api/messages/message-perfect");
    const alias = await request(app).get("/api/messages/list");

    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe("message-perfect");
    expect(detail.body).not.toHaveProperty("message");
    expect(alias.status).toBe(404);
  });

  it("starts with no leads", async () => {
    const leads = await request(app).get("/api/leads");

    expect(leads.status).toBe(200);
    expect(leads.body).toEqual([]);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("returns a stable error for malformed API JSON", async () => {
    const response = await request(app)
      .post("/api/ai/extract")
      .set("content-type", "application/json")
      .send('{"messageId":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_json" });
  });

  it("accepts only the strict messageId extraction request", async () => {
    const alias = await request(app).post("/api/ai/extract").send({ id: "message-perfect" });
    const perfect = await request(app).post("/api/ai/extract").send({ messageId: "message-perfect" });

    expect(alias.status).toBe(400);
    expect(perfect.status).toBe(200);
    expect(perfect.body).toEqual({ product: "Desk", quantity: 30, material: "Oak", budget: 50000 });
  });

  it("returns deterministic partial, failure, and empty extraction states", async () => {
    const partial = await request(app).post("/api/ai/extract").send({ messageId: "message-partial" });
    const failure = await request(app).post("/api/ai/extract").send({ messageId: "message-failure" });
    const empty = await request(app).post("/api/ai/extract").send({ messageId: "message-empty" });

    expect(partial.status).toBe(200);
    expect(partial.body).toEqual({ product: "Ergonomic Chair", quantity: null, material: "Black", budget: 12000 });
    expect(failure.status).toBe(500);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({});
  });

  describe("POST /api/leads", () => {
    it("creates a lead with status NEW and persists to database", async () => {
      const response = await request(app)
        .post("/api/leads")
        .send({
          sourceMessageId: "message-perfect",
          product: "Desk",
          quantity: 30,
          material: "Oak",
          budget: 50000,
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          sourceMessageId: "message-perfect",
          product: "Desk",
          quantity: 30,
          material: "Oak",
          budget: 50000,
          status: "NEW",
          createdAt: expect.any(String),
        }),
      );

      const inDb = await prisma.lead.findUnique({ where: { id: response.body.id } });
      expect(inDb).not.toBeNull();
      expect(inDb?.status).toBe("NEW");
    });

    it("always sets status NEW even if client passes another status", async () => {
      const response = await request(app)
        .post("/api/leads")
        .send({
          sourceMessageId: "message-perfect",
          product: "Desk",
          quantity: 1,
          status: "CONTACTED",
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("NEW");
      const inDb = await prisma.lead.findUnique({ where: { id: response.body.id } });
      expect(inDb?.status).toBe("NEW");
    });

    it("allows multiple leads to reference the same sourceMessageId", async () => {
      const first = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "First Lead",
        quantity: 5,
      });
      const second = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Second Lead",
        quantity: 10,
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).not.toBe(second.body.id);
    });

    it("accepts optional material as empty string or null, and optional budget", async () => {
      const response = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Simple Chair",
        quantity: 2,
        material: "",
        budget: null,
      });

      expect(response.status).toBe(201);
      expect(response.body.material).toBeNull();
      expect(response.body.budget).toBeNull();
    });

    it("rejects empty or whitespace-only product", async () => {
      const emptyProd = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "   ",
        quantity: 1,
      });

      expect(emptyProd.status).toBe(400);
    });

    it("rejects non-positive or non-integer quantity", async () => {
      const zeroQty = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Item",
        quantity: 0,
      });
      const negQty = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Item",
        quantity: -5,
      });
      const floatQty = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Item",
        quantity: 2.5,
      });

      expect(zeroQty.status).toBe(400);
      expect(negQty.status).toBe(400);
      expect(floatQty.status).toBe(400);
    });

    it("rejects negative or infinite budget", async () => {
      const negBudget = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Item",
        quantity: 1,
        budget: -10,
      });

      expect(negBudget.status).toBe(400);
    });

    it("rejects non-existent sourceMessageId with 4xx", async () => {
      const response = await request(app).post("/api/leads").send({
        sourceMessageId: "non-existent-msg-id",
        product: "Item",
        quantity: 1,
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "message_not_found" });
    });
  });

  describe("PATCH /api/leads/:leadId/status", () => {
    it("transitions an existing lead from NEW to CONTACTED", async () => {
      const created = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Status Test Item",
        quantity: 1,
      });

      const response = await request(app)
        .patch(`/api/leads/${created.body.id}/status`)
        .send({ status: "CONTACTED" });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(created.body.id);
      expect(response.body.status).toBe("CONTACTED");

      const inDb = await prisma.lead.findUnique({ where: { id: created.body.id } });
      expect(inDb?.status).toBe("CONTACTED");
    });

    it("rejects transition if status is already CONTACTED", async () => {
      const created = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Second Transition Item",
        quantity: 1,
      });

      await request(app)
        .patch(`/api/leads/${created.body.id}/status`)
        .send({ status: "CONTACTED" });

      const secondAttempt = await request(app)
        .patch(`/api/leads/${created.body.id}/status`)
        .send({ status: "CONTACTED" });

      expect(secondAttempt.status).toBe(400);
      expect(secondAttempt.body).toEqual({ error: "invalid_status_transition" });
    });

    it("rejects payload with invalid status or extra fields", async () => {
      const created = await request(app).post("/api/leads").send({
        sourceMessageId: "message-perfect",
        product: "Item",
        quantity: 1,
      });

      const invalidStatus = await request(app)
        .patch(`/api/leads/${created.body.id}/status`)
        .send({ status: "NEW" });

      const extraFields = await request(app)
        .patch(`/api/leads/${created.body.id}/status`)
        .send({ status: "CONTACTED", extra: "test" });

      expect(invalidStatus.status).toBe(400);
      expect(extraFields.status).toBe(400);
    });

    it("returns 404 for unknown leadId", async () => {
      const response = await request(app)
        .patch("/api/leads/non-existent-lead/status")
        .send({ status: "CONTACTED" });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "lead_not_found" });
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
