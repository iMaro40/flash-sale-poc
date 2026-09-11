export enum FlashSaleStatus {
  Upcoming = "upcoming",
  Active = "active",
  Ended = "ended",
}

export interface FlashSale {
  id: string;
  productId: string;
  startTime: Date;
  endTime: Date;
  status?: FlashSaleStatus;
}
