#!/usr/bin/env node
import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { QuestOracleAttestor } from "./oracle_attestor";
import { VideoAutomationEngine } from "./video_renderer";
import { EnterpriseNotifier } from "./notifier";

const program = new Command();

program
  .name("season0")
  .description("Season Zero, Pump the Pool 3 and Social Quests Enterprise Engine")
  .version("1.0.0");

program
  .command("generate-video")
  .description("Programmatically generate the Season Zero / Pump the Pool 3 explainer video")
  .option("-t, --tvl <number>", "Current Pool 3 TVL in USD", "1250000")
  .option("-a, --apy <number>", "Current APY Percentage", "48.5")
  .option("-o, --output <path>", "Output MP4 Path", "./season_zero_pool3.mp4")
  .action(async (options) => {
    const stats = {
      seasonName: "Season Zero",
      poolName: "Pump the Pool 3",
      totalTvlUsd: parseFloat(options.tvl),
      apyPercent: parseFloat(options.apy),
      activeQuestsCount: 5,
      topPumpers: [
        { address: "7xKXtg...9Pq", amount: 50000 },
        { address: "4uQe8...1Lz", amount: 32000 },
      ],
    };

    await VideoAutomationEngine.generateSeasonVideo(stats, options.output);
  });

program
  .command("sign-quest")
  .description("Generate Ed25519 signature proof for Social Quest completion")
  .requiredOption("-u, --user <pubkey>", "User Solana Public Key")
  .requiredOption("-q, --quest <id>", "Quest ID (0-63)")
  .option("-s, --season <id>", "Season ID", "0")
  .action(async (options) => {
    const oracle = new QuestOracleAttestor();
    const userPubkey = new PublicKey(options.user);
    const questId = parseInt(options.quest, 10);
    const seasonId = parseInt(options.season, 10);

    const { signature } = oracle.generateSignedAttestation(userPubkey, questId, seasonId);
    console.log("=== Quest Attestation Generated ===");
    console.log(`Oracle Pubkey: ${oracle.getPublicKey().toBase58()}`);
    console.log(`User:          ${userPubkey.toBase58()}`);
    console.log(`Quest ID:      ${questId}`);
    console.log(`Signature Hex: ${Buffer.from(signature).toString("hex")}`);

    await EnterpriseNotifier.broadcastQuestCompletion(userPubkey.toBase58(), questId, 100);
  });

program.parse(process.argv);