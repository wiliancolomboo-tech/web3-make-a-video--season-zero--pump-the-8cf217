use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("SeaZ0r0PumpPool3111111111111111111111111111");

#[program]
pub mod season_zero_engine {
    use super::*;

    pub fn initialize(ctx: Context<InitializeSeason>, season_number: u16) -> Result<()> {
        instructions::initialize::handler(ctx, season_number)
    }

    pub fn complete_social_quest(
        ctx: Context<CompleteSocialQuest>,
        quest_type: u8,
        proof_hash: [u8; 32],
        points: u32,
        signature: [u8; 64],
    ) -> Result<()> {
        instructions::complete_social_quest::handler(ctx, quest_type, proof_hash, points, signature)
    }

    pub fn pump_the_pool(
        ctx: Context<PumpThePool>,
        amount: u64,
        lock_duration_seconds: i64,
    ) -> Result<()> {
        instructions::pump_the_pool::handler(ctx, amount, lock_duration_seconds)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        instructions::claim_rewards::handler(ctx)
    }
}