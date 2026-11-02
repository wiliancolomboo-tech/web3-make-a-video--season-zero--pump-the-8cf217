import axios from "axios";
import { Resend } from "resend";

export class EnterpriseNotifier {
  private resend: Resend | null = null;
  private discordWebhookUrl: string | undefined;

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  }

  public async notifyCompletion(params: {
    participant: string;
    videoHash: string;
    txSignature: string;
    rewardAmount: number;
    userEmail?: string;
  }): Promise<void> {
    // 1. Dispatch Discord Enterprise Webhook
    if (this.discordWebhookUrl) {
      try {
        await axios.post(this.discordWebhookUrl, {
          embeds: [
            {
              title: "🎉 Season Zero: Pump the Pool 3 Quest Verified!",
              color: 3066993, // Green
              fields: [
                { name: "Participant", value: `\`${params.participant}\``, inline: false },
                { name: "Video Hash (SHA-256)", value: `\`${params.videoHash}\``, inline: false },
                { name: "Reward Dispersed", value: `${params.rewardAmount} PTP3 Tokens`, inline: true },
                {
                  name: "Solana Explorer",
                  value: `[View Transaction](https://explorer.solana.com/tx/${params.txSignature}?cluster=devnet)`,
                  inline: false,
                },
              ],
              footer: { text: "AuraQuest Engine v1.0 • Autonomous Liquidity Sentry" },
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } catch (err: any) {
        console.error("Failed to transmit Discord alert:", err.message);
      }
    }

    // 2. Dispatch Transactional Confirmation via Resend
    if (this.resend && params.userEmail) {
      try {
        await this.resend.emails.send({
          from: "SeasonZero@auraquest.io",
          to: params.userEmail,
          subject: "Verified: Season Zero & Pump the Pool 3 Reward Distribution",
          html: `
            <h2>Congratulations! Your Social Quest & Video Submission was Approved.</h2>
            <p>Your video proof (SHA256: <code>${params.videoHash}</code>) and DEX liquidity provision have been deterministically verified on Solana.</p>
            <p><strong>Reward Amount:</strong> ${params.rewardAmount} Tokens</p>
            <p><strong>Transaction ID:</strong> <a href="https://solscan.io/tx/${params.txSignature}">${params.txSignature}</a></p>
            <br/>
            <p>Keep pumping the pool and climbing Season Zero leaderboards!</p>
          `,
        });
      } catch (err: any) {
        console.error("Failed to transmit email confirmation via Resend:", err.message);
      }
    }
  }
}