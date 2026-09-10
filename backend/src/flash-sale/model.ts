export type Timestamptz = Date;

export interface FlashSale {
  id: string;
  productId: string;
  startTime: Timestamptz;
  endTime: Timestamptz;
  status: "upcoming" | "active" | "ended";
}
