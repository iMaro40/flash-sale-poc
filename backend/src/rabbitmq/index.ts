import "../env";

import amqplib, { type Channel, type ChannelModel } from "amqplib";

const url = process.env.RABBITMQ_URL ?? "amqp://localhost:5672";

let connection: ChannelModel | undefined;
let publishChannel: Channel | undefined;

export const connectRabbitMQ = async (): Promise<void> => {
  connection = await amqplib.connect(url);
  connection.on("error", (error: Error): void => {
    console.error("RabbitMQ connection error", error);
  });
  publishChannel = await connection.createChannel();
};

// Dedicated channel for publishing from the API process; consumers create their own channel(s).
export const getPublishChannel = (): Channel => {
  if (!publishChannel) {
    throw new Error("RabbitMQ publish channel is not initialized");
  }
  return publishChannel;
};

export const createConsumerChannel = async (): Promise<Channel> => {
  if (!connection) {
    throw new Error("RabbitMQ connection is not initialized");
  }
  return connection.createChannel();
};

export const closeRabbitMQ = async (): Promise<void> => {
  await publishChannel?.close();
  await connection?.close();
};
