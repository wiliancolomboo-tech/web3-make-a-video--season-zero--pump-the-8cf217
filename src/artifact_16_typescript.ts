import axios from "axios";
import { CONFIG } from "./config";

export class EnterpriseNotifier {
  public static async broadcastQuestCompletion(user: string, questId: number, points: number): Promise<void> {
    const message = {
      title: "🚀 Season Zero: Social Quest Claimed!",
      description: `User \`${user}\` completed Quest #${questId} and earned **${points} points**!`,
      fields: [
        { name: "Quest ID", value: `${questId}`, inline: true },
        { name: "Points", value: `+${points}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    await Promise.allSettled([
      this.sendDiscord(message),
      this.sendSlack(`:tada: *Season Zero Quest Completed!* User \`${user}\` claimed Quest #${questId} (+${points} pts)`),
    ]);
  }

  public static async broadcastPoolPump(user: string, amountUi: number, totalPoolLiquidity: number): Promise<void> {
    const message = {
      title: "🌊 Pump the Pool 3 Milestone!",
      description: `User \`${user}\` deposited **${amountUi} LP Tokens** into Pool 3!`,
      fields: [
        { name: "Deposit", value: `${amountUi} LP`, inline: true },
        { name: "Pool 3 TVL", value: `${totalPoolLiquidity} LP`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    await Promise.allSettled([
      this.sendDiscord(message),
      this.sendSlack(`:ocean: *Pool 3 Pumped!* User \`${user}\` deposited ${amountUi} LP. Pool Total: ${totalPoolLiquidity}`),
    ]);
  }

  private static async sendDiscord(embed: any): Promise<void> {
    if (!CONFIG.discordWebhookUrl) return;
    try {
      await axios.post(CONFIG.discordWebhookUrl, { embeds: [embed] });
    } catch (err: any) {
      console.error("[Notifier] Failed to push to Discord:", err.message);
    }
  }

  private static async sendSlack(text: string): Promise<void> {
    if (!CONFIG.slackWebhookUrl) return;
    try {
      await axios.post(CONFIG.slackWebhookUrl, { text });
    } catch (err: any) {
      console.error("[Notifier] Failed to push to Slack:", err.message);
    }
  }
}