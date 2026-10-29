import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { StockRepository } from '../../domain/ports/stock.repository.js';
import { ConfirmReservationCommand } from './confirm-reservation.command.js';

@CommandHandler(ConfirmReservationCommand)
export class ConfirmReservationHandler implements ICommandHandler<ConfirmReservationCommand> {
  constructor(private readonly stock: StockRepository) {}

  async execute({ orderId, tx }: ConfirmReservationCommand): Promise<void> {
    await this.stock.confirm(orderId, tx);
  }
}
