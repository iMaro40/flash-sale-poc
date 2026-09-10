export type Timestamptz = Date;

export enum FlashSaleStatus {
  Upcoming = "upcoming",
  Active = "active",
  Ended = "ended",
}

export interface FlashSale {
  id: string;
  productId: string;
  startTime: Timestamptz;
  endTime: Timestamptz;
  status: FlashSaleStatus;
}
