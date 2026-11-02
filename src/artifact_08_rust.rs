use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use crate::state::CampaignConfig;

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct InitializeCampaign<'info> {
    #[account(
        init,
        payer = admin,
        space = CampaignConfig::LEN,
        seeds = [b"campaign_config", season_id.to_le_bytes().as_ref()],
        bump
    )]
    pub config: Account<'info, CampaignConfig>,

    #[account(
        token::authority = config,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeCampaign>,
    season_id: u32,
    oracle_pubkey: Pubkey,
    min_pump_amount: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.oracle_pubkey = oracle_pubkey;
    config.pool_vault = ctx.accounts.pool_vault.key();
    config.season_id = season_id;
    config.total_points_issued = 0;
    config.total_liquidity_pumped = 0;
    config.min_pump_amount = min_pump_amount;
    config.is_active = true;
    config.bump = ctx.bumps.config;
    Ok(())
}