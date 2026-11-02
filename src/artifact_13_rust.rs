use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("QuestZ0111111111111111111111111111111111111");

#[program]
pub mod season_zero_quests {
    use super::*;

    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>,
        season_number: u8,
        pool_three_minimum_lp: u64,
    ) -> Result<()> {
        instructions::initialize_campaign::handler(ctx, season_number, pool_three_minimum_lp)
    }

    pub fn initialize_user(ctx: Context<InitializeUser>, season_number: u8) -> Result<()> {
        instructions::initialize_user::handler(ctx, season_number)
    }

    pub fn complete_quest(
        ctx: Context<CompleteQuest>,
        lp_amount: u64,
        points_to_award: u64,
        video_hash: [u8; 32],
        social_verified: bool,
    ) -> Result<()> {
        instructions::complete_quest::handler(
            ctx,
            lp_amount,
            points_to_award,
            video_hash,
            social_verified,
        )
    }
}