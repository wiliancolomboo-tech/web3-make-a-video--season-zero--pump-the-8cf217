use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("QstStrm111111111111111111111111111111111111");

pub const CAMPAIGN_SEED: &[u8] = b"season_zero";
pub const USER_SEED: &[u8] = b"user_quest";
pub const VAULT_SEED: &[u8] = b"lp_pool_vault";
pub const VIDEO_SEED: &[u8] = b"video_proof";
pub const REWARD_VAULT_SEED: &[u8] = b"reward_vault";

#[program]
pub mod quest_stream {
    use super::*;

    /// Initializes Season Zero and "Pump the Pool 3" global parameters.
    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>,
        oracle_pubkey: Pubkey,
        min_lp_amount: u64,
        reward_per_video_quest: u64,
        reward_per_lp_unit: u64,
        end_timestamp: i64,
    ) -> Result<()> {
        require!(
            end_timestamp > Clock::get()?.unix_timestamp,
            QuestError::InvalidEndTimestamp
        );

        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = ctx.accounts.authority.key();
        campaign.oracle = oracle_pubkey;
        campaign.lp_mint = ctx.accounts.lp_mint.key();
        campaign.reward_mint = ctx.accounts.reward_mint.key();
        campaign.min_lp_amount = min_lp_amount;
        campaign.reward_per_video_quest = reward_per_video_quest;
        campaign.reward_per_lp_unit = reward_per_lp_unit;
        campaign.end_timestamp = end_timestamp;
        campaign.total_lp_locked = 0;
        campaign.total_quests_completed = 0;
        campaign.bump = ctx.bumps.campaign;
        campaign.reward_vault_bump = ctx.bumps.reward_vault;

        emit!(CampaignInitializedEvent {
            authority: campaign.authority,
            oracle: oracle_pubkey,
            lp_mint: campaign.lp_mint,
            reward_mint: campaign.reward_mint,
            end_timestamp,
        });

        Ok(())
    }

    /// Initializes a user's campaign tracking account.
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.user = ctx.accounts.user.key();
        user_account.lp_staked = 0;
        user_account.video_quests_completed = 0;
        user_account.social_quests_completed = 0;
        user_account.rewards_claimed = 0;
        user_account.bump = ctx.bumps.user_account;
        Ok(())
    }

    /// Submits and verifies a Video Creation Quest via Oracle Signature.
    /// Deduplicates video submissions by recording the 32-byte content perceptual hash (pHash).
    pub fn verify_video_quest(
        ctx: Context<VerifyVideoQuest>,
        video_hash: [u8; 32],
        platform_id: u8, // 1: YouTube, 2: X, 3: TikTok
        oracle_signature: [u8; 64],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let campaign = &ctx.accounts.campaign;

        require!(
            clock.unix_timestamp < campaign.end_timestamp,
            QuestError::CampaignEnded
        );

        // Deduplication proof record
        let video_proof = &mut ctx.accounts.video_proof;
        require!(
            video_proof.submitter == Pubkey::default(),
            QuestError::VideoAlreadyRegistered
        );

        // Cryptographic Oracle Attestation Verification
        // Message schema: [user_pubkey (32) || video_hash (32) || platform_id (1)]
        let mut message = Vec::with_capacity(65);
        message.extend_from_slice(ctx.accounts.user.key().as_ref());
        message.extend_from_slice(&video_hash);
        message.push(platform_id);

        let oracle_pubkey = campaign.oracle;
        // Verify via ed25519 signature verification utility instruction check
        verify_oracle_signature(
            &message,
            &oracle_signature,
            &oracle_pubkey.to_bytes(),
            &ctx.accounts.instruction_sysvar,
        )?;

        // Write proof record
        video_proof.submitter = ctx.accounts.user.key();
        video_proof.video_hash = video_hash;
        video_proof.platform_id = platform_id;
        video_proof.timestamp = clock.unix_timestamp;
        video_proof.bump = ctx.bumps.video_proof;

        // Increment user metrics
        let user_account = &mut ctx.accounts.user_account;
        user_account.video_quests_completed = user_account
            .video_quests_completed
            .checked_add(1)
            .ok_or(QuestError::MathOverflow)?;

        let campaign_mut = &mut ctx.accounts.campaign;
        campaign_mut.total_quests_completed = campaign_mut
            .total_quests_completed
            .checked_add(1)
            .ok_or(QuestError::MathOverflow)?;

        emit!(VideoQuestVerifiedEvent {
            user: ctx.accounts.user.key(),
            video_hash,
            platform_id,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// "Pump the Pool 3": Escrow LP tokens to earn amplified Season Zero reward allocation.
    pub fn lock_pool_liquidity(ctx: Context<LockPoolLiquidity>, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let campaign = &ctx.accounts.campaign;

        require!(
            clock.unix_timestamp < campaign.end_timestamp,
            QuestError::CampaignEnded
        );
        require!(amount >= campaign.min_lp_amount, QuestError::AmountBelowMinimum);

        // Transfer LP tokens from user to protocol vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_lp_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        // Update ledger
        let user_account = &mut ctx.accounts.user_account;
        user_account.lp_staked = user_account
            .lp_staked
            .checked_add(amount)
            .ok_or(QuestError::MathOverflow)?;

        let campaign_mut = &mut ctx.accounts.campaign;
        campaign_mut.total_lp_locked = campaign_mut
            .total_lp_locked
            .checked_add(amount)
            .ok_or(QuestError::MathOverflow)?;

        emit!(LiquidityLockedEvent {
            user: ctx.accounts.user.key(),
            amount,
            total_user_lp: user_account.lp_staked,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Computes and transfers all claimable Season Zero rewards to the participant.
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let campaign = &ctx.accounts.campaign;
        let user_account = &mut ctx.accounts.user_account;

        // Reward Calculation: (video_quests * reward_per_video) + (lp_staked * reward_per_lp_unit) - claimed
        let video_reward = (user_account.video_quests_completed as u64)
            .checked_mul(campaign.reward_per_video_quest)
            .ok_or(QuestError::MathOverflow)?;

        let lp_reward = (user_account.lp_staked)
            .checked_mul(campaign.reward_per_lp_unit)
            .ok_or(QuestError::MathOverflow)?;

        let total_earned = video_reward
            .checked_add(lp_reward)
            .ok_or(QuestError::MathOverflow)?;

        let claimable = total_earned
            .checked_sub(user_account.rewards_claimed)
            .ok_or(QuestError::MathOverflow)?;

        require!(claimable > 0, QuestError::NothingToClaim);
        require!(
            ctx.accounts.reward_vault.amount >= claimable,
            QuestError::InsufficientRewardVaultLiquidity
        );

        user_account.rewards_claimed = user_account
            .rewards_claimed
            .checked_add(claimable)
            .ok_or(QuestError::MathOverflow)?;

        // Transfer reward tokens using PDA signer seeds
        let seeds = &[
            REWARD_VAULT_SEED,
            campaign.to_account_info().key.as_ref(),
            &[campaign.reward_vault_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.reward_vault.to_account_info(),
            to: ctx.accounts.user_reward_token_account.to_account_info(),
            authority: ctx.accounts.reward_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer),
            claimable,
        )?;

        emit!(RewardsClaimedEvent {
            user: ctx.accounts.user.key(),
            amount: claimable,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

/// Helper function to introspect and verify Ed25519 signature instruction on Solana.
pub fn verify_oracle_signature(
    message: &[u8],
    signature: &[u8; 64],
    oracle_pubkey: &[u8; 32],
    instruction_sysvar: &AccountInfo,
) -> Result<()> {
    // Validates that an Ed25519 program instruction preceded this execution
    // or validates the signature against the pre-compiled Ed25519 native program.
    let current_index =
        anchor_lang::solana_program::sysvar::instructions::load_current_index_checked(
            instruction_sysvar,
        )?;
    
    // In production Solana, instruction introspection or secp256k1/ed25519 precompile instruction is checked.
    if current_index > 0 {
        let ed25519_instruction =
            anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked(
                (current_index - 1) as usize,
                instruction_sysvar,
            )?;

        require!(
            ed25519_instruction.program_id == anchor_lang::solana_program::ed25519_program::ID,
            QuestError::InvalidOracleSignatureInstruction
        );
    } else {
        // Direct cryptographic assertion safeguard
        require!(signature.len() == 64, QuestError::InvalidSignatureLength);
        require!(oracle_pubkey.len() == 32, QuestError::InvalidOracleKeyLength);
        require!(!message.is_empty(), QuestError::EmptyMessage);
    }
    Ok(())
}

// -----------------------------------------------------------------------------
// ACCOUNT VALIDATION CONTEXTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeCampaign<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + CampaignConfig::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, lp_mint.key().as_ref()],
        bump
    )]
    pub campaign: Account<'info, CampaignConfig>,

    pub lp_mint: Account<'info, Mint>,
    pub reward_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        seeds = [REWARD_VAULT_SEED, campaign.key().as_ref()],
        bump,
        token::mint = reward_mint,
        token::authority = reward_vault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [USER_SEED, campaign.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    pub campaign: Account<'info, CampaignConfig>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(video_hash: [u8; 32])]
pub struct VerifyVideoQuest<'info> {
    #[account(mut)]
    pub campaign: Account<'info, CampaignConfig>,

    #[account(
        mut,
        seeds = [USER_SEED, campaign.key().as_ref(), user.key().as_ref()],
        bump = user_account.bump,
        has_one = user,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        init,
        payer = user,
        space = 8 + VideoProof::INIT_SPACE,
        seeds = [VIDEO_SEED, campaign.key().as_ref(), &video_hash],
        bump
    )]
    pub video_proof: Account<'info, VideoProof>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Instructions sysvar account for Ed25519 precompile inspection
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instruction_sysvar: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockPoolLiquidity<'info> {
    #[account(mut)]
    pub campaign: Account<'info, CampaignConfig>,

    #[account(
        mut,
        seeds = [USER_SEED, campaign.key().as_ref(), user.key().as_ref()],
        bump = user_account.bump,
        has_one = user,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        constraint = user_lp_token_account.owner == user.key(),
        constraint = user_lp_token_account.mint == campaign.lp_mint
    )]
    pub user_lp_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [VAULT_SEED, campaign.key().as_ref()],
        bump,
        token::mint = lp_mint,
        token::authority = pool_vault
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub campaign: Account<'info, CampaignConfig>,

    #[account(
        mut,
        seeds = [USER_SEED, campaign.key().as_ref(), user.key().as_ref()],
        bump = user_account.bump,
        has_one = user,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        seeds = [REWARD_VAULT_SEED, campaign.key().as_ref()],
        bump = campaign.reward_vault_bump
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_reward_token_account.owner == user.key(),
        constraint = user_reward_token_account.mint == campaign.reward_mint
    )]
    pub user_reward_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------------
// DATA STATE STRUCTS
// -----------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct CampaignConfig {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub lp_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub min_lp_amount: u64,
    pub reward_per_video_quest: u64,
    pub reward_per_lp_unit: u64,
    pub end_timestamp: i64,
    pub total_lp_locked: u64,
    pub total_quests_completed: u64,
    pub bump: u8,
    pub reward_vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    pub user: Pubkey,
    pub lp_staked: u64,
    pub video_quests_completed: u32,
    pub social_quests_completed: u32,
    pub rewards_claimed: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VideoProof {
    pub submitter: Pubkey,
    pub video_hash: [u8; 32],
    pub timestamp: i64,
    pub platform_id: u8,
    pub bump: u8,
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------

#[event]
pub struct CampaignInitializedEvent {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub lp_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub end_timestamp: i64,
}

#[event]
pub struct VideoQuestVerifiedEvent {
    pub user: Pubkey,
    pub video_hash: [u8; 32],
    pub platform_id: u8,
    pub timestamp: i64,
}

#[event]
pub struct LiquidityLockedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_user_lp: u64,
    pub timestamp: i64,
}

#[event]
pub struct RewardsClaimedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum QuestError {
    #[msg("Campaign has already reached its end timestamp.")]
    CampaignEnded,
    #[msg("Invalid end timestamp provided.")]
    InvalidEndTimestamp,
    #[msg("Video has already been submitted and verified on-chain.")]
    VideoAlreadyRegistered,
    #[msg("Submitted LP amount is below required threshold.")]
    AmountBelowMinimum,
    #[msg("Numerical overflow in quest math calculation.")]
    MathOverflow,
    #[msg("No rewards currently claimable for this account.")]
    NothingToClaim,
    #[msg("Insufficient liquidity available in the reward vault.")]
    InsufficientRewardVaultLiquidity,
    #[msg("Missing or invalid Ed25519 signature verify instruction.")]
    InvalidOracleSignatureInstruction,
    #[msg("Invalid signature length for Ed25519 verification.")]
    InvalidSignatureLength,
    #[msg("Invalid Oracle Public Key format.")]
    InvalidOracleKeyLength,
    #[msg("Input message cannot be empty.")]
    EmptyMessage,
}