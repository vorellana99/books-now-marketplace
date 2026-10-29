import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ReleaseStockCommand } from '../../../../contracts/inventory/release-stock.command.js';
import { ReserveStockCommand } from '../../../../contracts/inventory/reserve-stock.command.js';
import {
  StockReservation,
  type StockLine,
} from '../../domain/order/stock-reservation.port.js';

// Ventas habla con Inventario solo por sus comandos (`contracts/`). OutOfStockError y StockItemNotFoundError
// llegan con su clase, para que el filtro HTTP las responda como 422
@Injectable()
export class InventoryInProcessAdapter extends StockReservation {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  async reserve(orderId: string, lines: StockLine[]): Promise<void> {
    await this.commandBus.execute(new ReserveStockCommand(orderId, lines));
  }

  async release(orderId: string): Promise<void> {
    await this.commandBus.execute(new ReleaseStockCommand(orderId));
  }
}
