use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::errors::CampaignError;
use crate::state::{CampaignConfig, UserSeasonRecord};

#[derive(Accounts)]
pub struct PumpPoolLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"campaign_config", config.season_id.to_le_bytes().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, CampaignConfig>,

    #[account(
        mut,
        address = config.pool_vault
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"user_record", config.season_id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump = user_record.bump,
        has_one = user
    )]
    pub user_record: Account<'info, UserSeasonRecord>,

    #[account(
        mut,
        token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<PumpPoolLiquidity>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(config.is_active, CampaignError::CampaignInactive);
    require!(amount >= config.min_pump_amount, CampaignError::DepositBelowMinimum);

    // Transfer SPL tokens from user to pool vault via CPI
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.pool_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update pool state and user contribution
    let user_record = &mut ctx.accounts.user_record;
    user_record.total_pump_contributed = user_record
        .total_pump_contributed
        .checked_add(amount)
        .ok_or(CampaignError::MathOverflow)?;

    config.total_liquidity_pumped = config
        .total_liquidity_pumped
        .checked_add(amount)
        .ok_or(CampaignError::MathOverflow)?;

    emit!(PoolPumpedEvent {
        user: ctx.accounts.user.key(),
        season_id: config.season_id,
        amount_pumped: amount,
        total_user_pumped: user_record.total_pump_contributed,
        total_pool_pumped: config.total_liquidity_pumped,
    });

    Ok(())
}

#[event]
pub struct PoolPumpedEvent {
    pub user: Pubkey,
    pub season_id: u32,
    pub amount_pumped: u64,
    pub total_user_pumped: u64,
    pub total_pool_pumped: u64,
}