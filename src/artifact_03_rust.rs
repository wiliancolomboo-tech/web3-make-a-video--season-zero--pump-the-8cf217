use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::instruction::Instruction;

declare_id!("ZeroPumP11111111111111111111111111111111111");

pub const CAMPAIGN_SEED: &[u8] = b"season_zero_config";
pub const VAULT_SEED: &[u8] = b"reward_vault";
pub const RECORD_SEED: &[u8] = b"user_quest_record";

#[program]
pub mod season_zero_quests {
    use super::*;

    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>,
        season_id: u32,
        oracle_authority: Pubkey,
        min_pool_3_lp_amount: u64,
        reward_amount: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign_config;
        campaign.admin = ctx.accounts.admin.key();
        campaign.season_id = season_id;
        campaign.oracle_authority = oracle_authority;
        campaign.pool_3_lp_mint = ctx.accounts.pool_3_lp_mint.key();
        campaign.reward_mint = ctx.accounts.reward_mint.key();
        campaign.min_pool_3_lp_amount = min_pool_3_lp_amount;
        campaign.reward_amount = reward_amount;
        campaign.total_distributed = 0;
        campaign.is_active = true;
        campaign.bump = ctx.bumps.campaign_config;
        campaign.vault_bump = ctx.bumps.reward_vault;

        emit!(CampaignInitializedEvent {
            season_id,
            oracle_authority,
            min_pool_3_lp_amount,
            reward_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn claim_season_zero_reward(
        ctx: Context<ClaimReward>,
        quest_bitmask: u8,
        lp_amount_verified: u64,
        oracle_signature: [u8; 64],
    ) -> Result<()> {
        let campaign = &ctx.accounts.campaign_config;
        require!(campaign.is_active, QuestError::CampaignPaused);
        require!(
            lp_amount_verified >= campaign.min_pool_3_lp_amount,
            QuestError::InsufficientPool3Liquidity
        );

        // Required Quests: Bit 0 = Video Created, Bit 1 = Pool 3 LP Added, Bit 2 = Social Follows
        // Bitmask 0x07 (binary 00000111) requires all 3 quests completed
        require!(
            (quest_bitmask & 0x07) == 0x07,
            QuestError::MissingRequiredQuests
        );

        // Verify that the user currently possesses at least lp_amount_verified in their LP account
        require!(
            ctx.accounts.user_lp_token_account.amount >= lp_amount_verified,
            QuestError::InsufficientPool3Liquidity
        );

        let user_record = &mut ctx.accounts.user_quest_record;
        require!(!user_record.has_claimed, QuestError::RewardAlreadyClaimed);

        // Cryptographic Ed25519 Oracle Verification
        let message = build_attestation_message(
            &ctx.accounts.user.key(),
            campaign.season_id,
            quest_bitmask,
            lp_amount_verified,
        );

        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &campaign.oracle_authority,
            &message,
            &oracle_signature,
        )?;

        // Execute Reward Transfer from PDA Vault to User Reward Account
        let season_bytes = campaign.season_id.to_le_bytes();
        let seeds = &[
            VAULT_SEED,
            season_bytes.as_ref(),
            &[campaign.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let transfer_cpi = Transfer {
            from: ctx.accounts.reward_vault.to_account_info(),
            to: ctx.accounts.user_reward_token_account.to_account_info(),
            authority: ctx.accounts.reward_vault.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi,
            signer_seeds,
        );
        token::transfer(cpi_ctx, campaign.reward_amount)?;

        // Update User State
        user_record.user = ctx.accounts.user.key();
        user_record.season_id = campaign.season_id;
        user_record.quest_bitmask = quest_bitmask;
        user_record.claimed_at = Clock::get()?.unix_timestamp;
        user_record.has_claimed = true;
        user_record.reward_payout = campaign.reward_amount;
        user_record.bump = ctx.bumps.user_quest_record;

        let campaign_mut = &mut ctx.accounts.campaign_config;
        campaign_mut.total_distributed = campaign_mut
            .total_distributed
            .checked_add(campaign.reward_amount)
            .ok_or(QuestError::MathOverflow)?;

        emit!(QuestCompletedEvent {
            user: ctx.accounts.user.key(),
            season_id: campaign.season_id,
            quest_bitmask,
            reward_payout: campaign.reward_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn set_campaign_status(
        ctx: Context<ManageCampaign>,
        is_active: bool,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign_config;
        campaign.is_active = is_active;
        Ok(())
    }
}

/// Helper function to reconstruct the canonical attestation payload
pub fn build_attestation_message(
    user: &Pubkey,
    season_id: u32,
    quest_bitmask: u8,
    lp_amount: u64,
) -> Vec<u8> {
    let mut msg = Vec::with_capacity(32 + 4 + 1 + 8);
    msg.extend_from_slice(user.as_ref());
    msg.extend_from_slice(&season_id.to_le_bytes());
    msg.push(quest_bitmask);
    msg.extend_from_slice(&lp_amount.to_le_bytes());
    msg
}

/// Validates Ed25519 Signature Precompile Instruction executed in the same transaction
pub fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    message: &[u8],
    signature: &[u8; 64],
) -> Result<()> {
    let current_index = anchor_lang::solana_program::sysvar::instructions::load_current_index_checked(instructions_sysvar)?;
    require!(current_index > 0, QuestError::MissingPrecompileInstruction);

    // Load preceding instruction in the transaction
    let precompile_ix: Instruction = anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked(
        (current_index - 1) as usize,
        instructions_sysvar,
    )?;

    require!(
        precompile_ix.program_id == ed25519_program::ID,
        QuestError::InvalidEd25519ProgramId
    );

    let data = precompile_ix.data;
    require!(data.len() >= 16 + 64 + 32 + message.len(), QuestError::MalformedPrecompileData);

    // Verify public key match
    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let pubkey_slice = &data[pubkey_offset..pubkey_offset + 32];
    require!(
        pubkey_slice == expected_signer.as_ref(),
        QuestError::UnauthorizedOracleSigner
    );

    // Verify signature match
    let sig_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let sig_slice = &data[sig_offset..sig_offset + 64];
    require!(
        sig_slice == signature,
        QuestError::SignatureMismatch
    );

    // Verify message payload match
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_len = u16::from_le_bytes([data[12], data[13]]) as usize;
    let msg_slice = &data[msg_offset..msg_offset + msg_len];
    require!(
        msg_slice == message,
        QuestError::PayloadMismatch
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct InitializeCampaign<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + CampaignConfig::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, season_id.to_le_bytes().as_ref()],
        bump
    )]
    pub campaign_config: Account<'info, CampaignConfig>,

    pub pool_3_lp_mint: Account<'info, Mint>,
    pub reward_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_SEED, season_id.to_le_bytes().as_ref()],
        bump,
        token::mint = reward_mint,
        token::authority = reward_vault
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [CAMPAIGN_SEED, campaign_config.season_id.to_le_bytes().as_ref()],
        bump = campaign_config.bump
    )]
    pub campaign_config: Account<'info, CampaignConfig>,

    #[account(
        init,
        payer = user,
        space = 8 + UserQuestRecord::INIT_SPACE,
        seeds = [RECORD_SEED, campaign_config.season_id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_quest_record: Account<'info, UserQuestRecord>,

    #[account(
        constraint = user_lp_token_account.mint == campaign_config.pool_3_lp_mint,
        constraint = user_lp_token_account.owner == user.key()
    )]
    pub user_lp_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_reward_token_account.mint == campaign_config.reward_mint,
        constraint = user_reward_token_account.owner == user.key()
    )]
    pub user_reward_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED, campaign_config.season_id.to_le_bytes().as_ref()],
        bump = campaign_config.vault_bump
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    /// CHECK: Validated instruction introspection sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ManageCampaign<'info> {
    #[account(
        mut,
        has_one = admin @ QuestError::UnauthorizedAdmin
    )]
    pub campaign_config: Account<'info, CampaignConfig>,
    pub admin: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignConfig {
    pub admin: Pubkey,
    pub season_id: u32,
    pub oracle_authority: Pubkey,
    pub pool_3_lp_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub min_pool_3_lp_amount: u64,
    pub reward_amount: u64,
    pub total_distributed: u64,
    pub is_active: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserQuestRecord {
    pub user: Pubkey,
    pub season_id: u32,
    pub quest_bitmask: u8,
    pub claimed_at: i64,
    pub reward_payout: u64,
    pub has_claimed: bool,
    pub bump: u8,
}

#[event]
pub struct CampaignInitializedEvent {
    pub season_id: u32,
    pub oracle_authority: Pubkey,
    pub min_pool_3_lp_amount: u64,
    pub reward_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct QuestCompletedEvent {
    pub user: Pubkey,
    pub season_id: u32,
    pub quest_bitmask: u8,
    pub reward_payout: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum QuestError {
    #[msg("Campaign is currently paused or inactive")]
    CampaignPaused,
    #[msg("Insufficient Pump the Pool 3 LP balance in user token account")]
    InsufficientPool3Liquidity,
    #[msg("Missing required quests: Video creation, Pool 3 LP, or Social Quest")]
    MissingRequiredQuests,
    #[msg("Reward already claimed for Season Zero")]
    RewardAlreadyClaimed,
    #[msg("Arithmetic overflow occurred")]
    MathOverflow,
    #[msg("Preceding instruction is not the Ed25519 verify precompile")]
    MissingPrecompileInstruction,
    #[msg("Invalid program id for Ed25519 verification")]
    InvalidEd25519ProgramId,
    #[msg("Ed25519 instruction data is malformed")]
    MalformedPrecompileData,
    #[msg("Oracle signature was not produced by the authorized oracle key")]
    UnauthorizedOracleSigner,
    #[msg("Provided signature does not match attestation payload")]
    SignatureMismatch,
    #[msg("Instruction payload bytes do not match expected campaign state")]
    PayloadMismatch,
    #[msg("Unauthorized admin interaction")]
    UnauthorizedAdmin,
}