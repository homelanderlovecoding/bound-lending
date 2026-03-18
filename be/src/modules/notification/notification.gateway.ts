import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENT } from '../../commons/constants';

interface ISubscription {
  channels: Set<string>;
  userId?: string;
}

@WebSocketGateway({ path: '/ws' })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private readonly clients = new Map<WebSocket, ISubscription>();

  handleConnection(client: WebSocket): void {
    this.clients.set(client, { channels: new Set() });
    this.logger.log(`Client connected (total: ${this.clients.size})`);
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
    this.logger.log(`Client disconnected (total: ${this.clients.size})`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { channels: string[] },
  ): void {
    const sub = this.clients.get(client);
    if (!sub) return;
    for (const ch of data.channels) {
      sub.channels.add(ch);
    }
    this.logger.debug(`Client subscribed to: ${data.channels.join(', ')}`);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { channels: string[] },
  ): void {
    const sub = this.clients.get(client);
    if (!sub) return;
    for (const ch of data.channels) {
      sub.channels.delete(ch);
    }
  }

  /** Broadcast to all clients subscribed to a channel */
  broadcastToChannel(channel: string, event: string, data: unknown): void {
    for (const [client, sub] of this.clients) {
      if (sub.channels.has(channel) && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ event, data }));
      }
    }
  }

  // ===== Event Listeners =====

  @OnEvent(EVENT.RFQ_OFFER_RECEIVED)
  handleOfferReceived(payload: { rfqId: string; offerId: string }): void {
    this.broadcastToChannel(`rfq:${payload.rfqId}`, 'rfq:offer_received', payload);
  }

  @OnEvent(EVENT.RFQ_OFFER_WITHDRAWN)
  handleOfferWithdrawn(payload: { rfqId: string; offerId: string }): void {
    this.broadcastToChannel(`rfq:${payload.rfqId}`, 'rfq:offer_withdrawn', payload);
  }

  @OnEvent(EVENT.RFQ_ACCEPTED)
  handleRfqAccepted(payload: { rfqId: string; offerId: string }): void {
    this.broadcastToChannel(`rfq:${payload.rfqId}`, 'rfq:accepted', payload);
  }

  @OnEvent(EVENT.RFQ_EXPIRED)
  handleRfqExpired(payload: { rfqId: string }): void {
    this.broadcastToChannel(`rfq:${payload.rfqId}`, 'rfq:expired', payload);
  }

  @OnEvent(EVENT.LOAN_ORIGINATION_SIGNED)
  handleOriginationSigned(payload: { loanId: string; party: string }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:origination_signed', payload);
  }

  @OnEvent(EVENT.LOAN_ACTIVATED)
  handleLoanActivated(payload: { loanId: string }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:activated', payload);
  }

  @OnEvent(EVENT.LOAN_REPAID)
  handleLoanRepaid(payload: { loanId: string }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:repaid', payload);
  }

  @OnEvent(EVENT.LOAN_IN_DANGER)
  handleLoanInDanger(payload: { loanId: string; currentLtv: number; btcPrice: number }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:in_danger', payload);
  }

  @OnEvent(EVENT.LOAN_LIQUIDATED)
  handleLoanLiquidated(payload: { loanId: string }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:liquidated', payload);
  }

  @OnEvent(EVENT.LOAN_GRACE_STARTED)
  handleGraceStarted(payload: { loanId: string }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:grace_started', payload);
  }

  @OnEvent(EVENT.LOAN_DEFAULTED)
  handleLoanDefaulted(payload: { loanId: string }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:defaulted', payload);
  }

  @OnEvent(EVENT.LOAN_FORFEITED)
  handleLoanForfeited(payload: { loanId: string }): void {
    this.broadcastToChannel(`loan:${payload.loanId}`, 'loan:forfeited', payload);
  }

  @OnEvent(EVENT.RFQ_CREATED)
  handleRfqCreated(payload: { rfqId: string }): void {
    // Broadcast to all connected lenders on lender feed
    this.broadcastToChannel('lender:feed', 'rfq:new', payload);
  }
}
