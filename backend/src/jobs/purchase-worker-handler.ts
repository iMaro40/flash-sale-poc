import type { Channel, ConsumeMessage } from "amqplib";

import type { QueuedPurchase } from "../purchase/dto/queued-purchase";
import type { PurchaseService } from "../purchase/service";
import { withRetry } from "../utils/with-retry";

export const processPurchaseMessage = async (
  message: ConsumeMessage,
  channel: Channel,
  service: Pick<PurchaseService, "completePurchase" | "cancelPurchase">,
): Promise<void> => {
  let queuedPurchase: QueuedPurchase | undefined;

  try {
    const parsedPurchase = JSON.parse(
      message.content.toString(),
    ) as QueuedPurchase;
    queuedPurchase = parsedPurchase;

    await withRetry(
      () =>
        service.completePurchase(
          parsedPurchase.input,
          parsedPurchase.transactionId,
        ),
      {
        baseDelayMs: 50,
        maxDelayMs: 1000,
      },
    );
    channel.ack(message);
  } catch (error) {
    console.error("[purchase-worker] Failed to process purchase", error);

    if (queuedPurchase) {
      try {
        await service.cancelPurchase(
          queuedPurchase.transactionId,
          queuedPurchase.input,
        );
      } catch (cancellationError) {
        console.error(
          "[purchase-worker] Failed to cancel purchase",
          cancellationError,
        );
      }
    }

    channel.nack(message, false, false);
  }
};
