export type Timestamptz = Date;

export interface FlashSale {
  id: string;
  productId: string;
  startTime: Timestamptz;
  endTime: Timestamptz;
  userId: string;
}

export interface CreateFlashSaleInput {
  productId: string;
  startTime: Timestamptz;
  endTime: Timestamptz;
  userId: string;
}

export interface FlashSaleDbRow {
  id: string;
  product_id: string;
  start_time: Timestamptz;
  end_time: Timestamptz;
  user_id: string;
}

export interface CreateFlashSaleDbInput {
  product_id: string;
  start_time: Timestamptz;
  end_time: Timestamptz;
  user_id: string;
}
