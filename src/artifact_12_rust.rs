use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::initialize_season::*;
use instructions::initialize_user::*;
use instructions::pump_pool::*;
use instructions::verify_social_quest::*;

declare_id!("Pump3SeasonZero11111111111111111111111111111");

#[program]
pub mod season_zero_core {
    use super::*;

    pub fn initialize_season(
        ctx: Context<InitializeSeason>,
        season_id: u32,
        oracle_authority: Pubkey,
        base_multiplier_bps: u16,
    ) -> Result<()> {
        instructions::initialize_season::handler(ctx, season_id, oracle_authority, base_multiplier_bps)
    }

    pub fn initialize_user(ctx: Context<InitializeUser>, season_id: u32) -> Result<()> {
        instructions::initialize_user::handler(ctx, season_id)
    }

    pub fn pump_pool(ctx: Context<PumpPool>, season_id: u32, amount: u64) -> Result<()> {
        instructions::pump_pool::handler(ctx, season_id, amount)
    }

    pub fn verify_social_quest(
        ctx: Context<VerifySocialQuest>,
        season_id: u32,
        quest_id: u32,
        points: u64,
    ) -> Result<()> {
        instructions::verify_social_quest::handler(ctx, season_id, quest_id, points)
    }
}