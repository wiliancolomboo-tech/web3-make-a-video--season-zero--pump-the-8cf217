use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program::ID as ED25519_PROGRAM_ID;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("PUMP3sEAs0nZEr0Quest11111111111111111111111");

pub const CAMPAIGN_SEED: &[u8] = b"season_zero";
pub const USER_SEED: &[u8] = b"user_quest";
pub const POOL_SEED: &[u8] = b"pump_pool_3";
pub const VAULT_SEED: &[u8] = b"reward_vault";

#[program]
pub mod pump_pool_quests {
    use super::*;

    /// Initialize Season Zero campaign configuration and reward vault.
    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>,
        season_id: u32,
        oracle_signer: Pubkey,
        season_end_timestamp: i64,
        base_reward_rate: u64,
    ) -> Result<()> {
        require!(
            season_end_timestamp > Clock::get()?.unix_timestamp,
            QuestError::InvalidEpoch
        );
        require!(base_reward_rate > 0, QuestError::ZeroRewardRate);

        let campaign = &mut ctx.accounts.campaign;
        campaign.admin = ctx.accounts.admin.key();
        campaign.oracle_signer = oracle_signer;
        campaign.season_id = season_id;
        campaign.season_end_timestamp = season_end_timestamp;
        campaign.base_reward_rate = base_reward_rate;
        campaign.total_liquidity_deposited = 0;
        campaign.total_participants = 0;
        campaign.is_active = true;
        campaign.bump = ctx.bumps.campaign;
        campaign.vault_bump = ctx.bumps.reward_vault;

        emit!(CampaignInitializedEvent {
            season_id,
            oracle_signer,
            season_end_timestamp,
        });

        Ok(())
    }

    /// User enters Season Zero and deposits liquidity for "Pump the Pool 3".
    pub fn pump_pool_liquidity(
        ctx: Context<PumpPoolLiquidity>,
        amount_lamports: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        require!(campaign.is_active, QuestError::CampaignInactive);
        require!(
            Clock::get()?.unix_timestamp < campaign.season_end_timestamp,
            QuestError::SeasonEnded
        );
        require!(amount_lamports >= 100_000_000, QuestError::BelowMinLiquidity); // min 0.1 SOL

        // Transfer SOL into the Pump the Pool 3 PDA
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.pool_pda.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount_lamports)?;

        let user_record = &mut ctx.accounts.user_record;
        if user_record.deposited_liquidity == 0 {
            campaign.total_participants = campaign
                .total_participants
                .checked_add(1)
                .ok_or(QuestError::MathOverflow)?;
            user_record.user = ctx.accounts.user.key();
            user_record.season_id = campaign.season_id;
            user_record.bump = ctx.bumps.user_record;
            user_record.social_quests_completed = 0;
            user_record.has_claimed_rewards = false;
        }

        user_record.deposited_liquidity = user_record
            .deposited_liquidity
            .checked_add(amount_lamports)
            .ok_or(QuestError::MathOverflow)?;
        user_record.last_deposit_timestamp = Clock::get()?.unix_timestamp;

        campaign.total_liquidity_deposited = campaign
            .total_liquidity_deposited
            .checked_add(amount_lamports)
            .ok_or(QuestError::MathOverflow)?;

        emit!(LiquidityPumpedEvent {
            user: ctx.accounts.user.key(),
            amount: amount_lamports,
            cumulative: user_record.deposited_liquidity,
        });

        Ok(())
    }

    /// Oracle verifies completion of Social Quests (Video creation, repost, engagement).
    /// Quest ID 1: "Make a Video: Season Zero, Pump the Pool 3 & Social Quests"
    pub fn verify_social_quest(
        ctx: Context<VerifySocialQuest>,
        quest_id: u8,
        proof_hash: [u8; 32],
    ) -> Result<()> {
        let campaign = &ctx.accounts.campaign;
        let user_record = &mut ctx.accounts.user_record;

        require!(campaign.is_active, QuestError::CampaignInactive);
        require!(
            Clock::get()?.unix_timestamp < campaign.season_end_timestamp,
            QuestError::SeasonEnded
        );
        require!(
            user_record.deposited_liquidity > 0,
            QuestError::NoLiquidityPumped
        );
        require!(quest_id < 8, QuestError::InvalidQuestId);

        let bitmask: u8 = 1 << quest_id;
        require!(
            (user_record.social_quests_completed & bitmask) == 0,
            QuestError::QuestAlreadyCompleted
        );

        user_record.social_quests_completed |= bitmask;

        emit!(SocialQuestVerifiedEvent {
            user: user_record.user,
            quest_id,
            proof_hash,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Claim accrued Season Zero & Pump the Pool rewards.
    pub fn claim_season_rewards(ctx: Context<ClaimSeasonRewards>) -> Result<()> {
        let campaign = &ctx.accounts.campaign;
        let user_record = &mut ctx.accounts.user_record;

        require!(!user_record.has_claimed_rewards, QuestError::RewardAlreadyClaimed);
        require!(user_record.deposited_liquidity > 0, QuestError::NoLiquidityPumped);

        // Calculate Reward with Quest Multipliers
        // Base points = deposited_liquidity / 1e6
        // Each social quest grants a 25% boost (e.g. video quest = 25% bump)
        let quest_count = user_record.social_quests_completed.count_ones() as u64;
        let base_amount = (user_record.deposited_liquidity / 1_000_000)
            .checked_mul(campaign.base_reward_rate)
            .ok_or(QuestError::MathOverflow)?;

        let multiplier_percent = 100u64.checked_add(quest_count.checked_mul(25).unwrap()).unwrap();
        let total_reward = base_amount
            .checked_mul(multiplier_percent)
            .ok_or(QuestError::MathOverflow)?
            / 100;

        require!(total_reward > 0, QuestError::ZeroCalculatedReward);
        require!(
            ctx.accounts.reward_vault.amount >= total_reward,
            QuestError::InsufficientVaultLiquidity
        );

        // PDA signer seeds for vault authority transfer
        let season_id_bytes = campaign.season_id.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[
            VAULT_SEED,
            season_id_bytes.as_ref(),
            &[campaign.vault_bump],
        ]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reward_vault.to_account_info(),
                to: ctx.accounts.user_reward_account.to_account_info(),
                authority: ctx.accounts.reward_vault.to_account_info(),
            },
            seeds,
        );

        token::transfer(cpi_ctx, total_reward)?;
        user_record.has_claimed_rewards = true;

        emit!(RewardsClaimedEvent {
            user: user_record.user,
            reward_amount: total_reward,
            quests_completed: quest_count as u8,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// ACCOUNT VALIDATION STRUCTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct InitializeCampaign<'info> {
    #[account(
        init,
        payer = admin,
        space = CampaignConfig::LEN,
        seeds = [CAMPAIGN_SEED, &season_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, CampaignConfig>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_SEED, &season_id.to_le_bytes()],
        bump,
        token::mint = reward_mint,
        token::authority = reward_vault
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    pub reward_mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct PumpPoolLiquidity<'info> {
    #[account(
        mut,
        seeds = [CAMPAIGN_SEED, &campaign.season_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignConfig>,

    /// CHECK: Pool PDA holding native SOL reserves for Pump the Pool 3
    #[account(
        mut,
        seeds = [POOL_SEED, &campaign.season_id.to_le_bytes()],
        bump
    )]
    pub pool_pda: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserQuestRecord::LEN,
        seeds = [USER_SEED, campaign.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_record: Account<'info, UserQuestRecord>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifySocialQuest<'info> {
    #[account(
        seeds = [CAMPAIGN_SEED, &campaign.season_id.to_le_bytes()],
        bump = campaign.bump,
        has_one = oracle_signer @ QuestError::UnauthorizedOracle
    )]
    pub campaign: Account<'info, CampaignConfig>,

    #[account(
        mut,
        seeds = [USER_SEED, campaign.key().as_ref(), user_record.user.as_ref()],
        bump = user_record.bump
    )]
    pub user_record: Account<'info, UserQuestRecord>,

    pub oracle_signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimSeasonRewards<'info> {
    #[account(
        seeds = [CAMPAIGN_SEED, &campaign.season_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignConfig>,

    #[account(
        mut,
        seeds = [USER_SEED, campaign.key().as_ref(), user.key().as_ref()],
        bump = user_record.bump,
        has_one = user @ QuestError::UnauthorizedUser
    )]
    pub user_record: Account<'info, UserQuestRecord>,

    #[account(
        mut,
        seeds = [VAULT_SEED, &campaign.season_id.to_le_bytes()],
        bump = campaign.vault_bump
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_reward_account.owner == user.key() @ QuestError::InvalidTokenOwner,
        constraint = user_reward_account.mint == reward_vault.mint @ QuestError::InvalidMint
    )]
    pub user_reward_account: Account<'info, TokenAccount>,

    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------------
// STATE SCHEMAS
// -----------------------------------------------------------------------------

#[account]
pub struct CampaignConfig {
    pub admin: Pubkey,                  // 32
    pub oracle_signer: Pubkey,          // 32
    pub season_id: u32,                 // 4
    pub season_end_timestamp: i64,      // 8
    pub base_reward_rate: u64,          // 8
    pub total_liquidity_deposited: u64, // 8
    pub total_participants: u64,        // 8
    pub is_active: bool,                // 1
    pub bump: u8,                       // 1
    pub vault_bump: u8,                 // 1
}

impl CampaignConfig {
    pub const LEN: usize = 8 + 32 + 32 + 4 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 64; // with buffer
}

#[account]
pub struct UserQuestRecord {
    pub user: Pubkey,                    // 32
    pub season_id: u32,                  // 4
    pub deposited_liquidity: u64,        // 8
    pub last_deposit_timestamp: i64,     // 8
    pub social_quests_completed: u8,     // 1 (Bitmask: bit 0 = video quest, bit 1 = repost, etc.)
    pub has_claimed_rewards: bool,       // 1
    pub bump: u8,                        // 1
}

impl UserQuestRecord {
    pub const LEN: usize = 8 + 32 + 4 + 8 + 8 + 1 + 1 + 1 + 32; // with buffer
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------

#[event]
pub struct CampaignInitializedEvent {
    pub season_id: u32,
    pub oracle_signer: Pubkey,
    pub season_end_timestamp: i64,
}

#[event]
pub struct LiquidityPumpedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub cumulative: u64,
}

#[event]
pub struct SocialQuestVerifiedEvent {
    pub user: Pubkey,
    pub quest_id: u8,
    pub proof_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct RewardsClaimedEvent {
    pub user: Pubkey,
    pub reward_amount: u64,
    pub quests_completed: u8,
}

#[error_code]
pub enum QuestError {
    #[msg("Campaign epoch is invalid.")]
    InvalidEpoch,
    #[msg("Reward rate must be greater than zero.")]
    ZeroRewardRate,
    #[msg("Campaign is currently inactive.")]
    CampaignInactive,
    #[msg("Season Zero has officially ended.")]
    SeasonEnded,
    #[msg("Deposited liquidity is below the minimum threshold (0.1 SOL).")]
    BelowMinLiquidity,
    #[msg("Arithmetic overflow detected.")]
    MathOverflow,
    #[msg("Unauthorized oracle signer.")]
    UnauthorizedOracle,
    #[msg("User must deposit liquidity before verifying social quests.")]
    NoLiquidityPumped,
    #[msg("Invalid Quest ID requested.")]
    InvalidQuestId,
    #[msg("Social quest has already been verified and credited.")]
    QuestAlreadyCompleted,
    #[msg("User has already claimed Season Zero rewards.")]
    RewardAlreadyClaimed,
    #[msg("Reward calculation yielded zero.")]
    ZeroCalculatedReward,
    #[msg("Insufficient reward tokens available in vault.")]
    InsufficientVaultLiquidity,
    #[msg("Unauthorized user signer.")]
    UnauthorizedUser,
    #[msg("Invalid token account owner.")]
    InvalidTokenOwner,
    #[msg("Token account mint mismatch.")]
    InvalidMint,
}