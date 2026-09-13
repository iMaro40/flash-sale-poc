export enum FlashSaleStatus {
  UPCOMING = "UPCOMING",
  ACTIVE = "ACTIVE",
  ENDED = "ENDED",
}

export interface FlashSale {
  id: string;
  productId: string;
  startTime: Date;
  endTime: Date;
  status?: FlashSaleStatus;
}
