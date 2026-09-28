export type Lead = {
  id: string;
  sourceMessageId: string;
  product: string;
  quantity: number;
  material: string | null;
  budget: number | null;
  status: string;
  createdAt: string;
};

export type Message = {
  id: string;
  senderName: string;
  senderEmail: string;
  company: string;
  subject: string;
  body: string;
  createdAt: string;
};

export type ExtractionResult = {
  product?: string;
  quantity?: number | null;
  material?: string | null;
  budget?: number | null;
};

export type CreateLeadInput = {
  sourceMessageId: string;
  product: string;
  quantity: number;
  material?: string | null;
  budget?: number | null;
};
