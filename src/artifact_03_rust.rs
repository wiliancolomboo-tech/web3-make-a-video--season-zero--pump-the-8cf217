// programs/pump_the_pool_quests/src/lib.rs
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program::ID as ED25519_PROGRAM_ID,
    instruction::Instruction,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

declare_id!("PUMP3zEroQuest1111111111111111111111111111111");

pub const DISCRIMINATOR_LENGTH: usize = 8;
pub const MAX_QUEST_BITS: u8 = 8;

#[program]
pub mod pump_the_pool_quests {
    use super::*;

    /// Initialize a new Season Zero campaign instance for Pump the Pool 3
    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>,
        season_id: u32,
        oracle_pubkey: [u8; 32],
        min_lp_liquidity: u64,
        season_end_timestamp: i64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.admin = ctx.accounts.admin.key();
        campaign.season_id = season_id;
        campaign.oracle_pubkey = oracle_pubkey;
        campaign.min_lp_liquidity = min_lp_liquidity;
        campaign.season_end_timestamp = season_end_timestamp;
        campaign.total_participants = 0;
        campaign.total_xp_awarded = 0;
        campaign.is_active = true;
        campaign.bump = ctx.bumps.campaign;

        emit!(CampaignInitialized {
            season_id,
            admin: campaign.admin,
            min_lp_liquidity,
            season_end_timestamp,
        });

        Ok(())
    }

    /// Claim social quest tier and verify Pump the Pool 3 liquidity position
    pub fn claim_quest_with_lp_proof(
        ctx: Context<ClaimQuestWithLpProof>,
        quest_bit_flag: u8,
        lp_position_amount: u64,
        xp_reward: u64,
        signature: [u8; 64],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let campaign = &mut ctx.accounts.campaign;
        let user_record = &mut ctx.accounts.user_record;

        require!(campaign.is_active, QuestError::CampaignInactive);
        require!(
            clock.unix_timestamp < campaign.season_end_timestamp,
            QuestError::SeasonEnded
        );
        require!(quest_bit_flag < MAX_QUEST_BITS, QuestError::InvalidQuestBit);
        require!(
            lp_position_amount >= campaign.min_lp_liquidity,
            QuestError::InsufficientLpLiquidity
        );

        // Check if quest has already been completed by user
        let mask = 1u8 << quest_bit_flag;
        require!(
            (user_record.completed_quests_mask & mask) == 0,
            QuestError::QuestAlreadyCompleted
        );

        // Cryptographically verify oracle signature via Sysvar Instructions introspection
        verify_oracle_signature(
            &ctx.accounts.sysvar_instructions,
            &campaign.oracle_pubkey,
            &ctx.accounts.user.key().to_bytes(),
            quest_bit_flag,
            lp_position_amount,
            &signature,
        )?;

        // Update state
        if user_record.completed_quests_mask == 0 {
            campaign.total_participants = campaign
                .total_participants
                .checked_add(1)
                .ok_or(QuestError::MathOverflow)?;
            user_record.user = ctx.accounts.user.key();
            user_record.campaign = campaign.key();
            user_record.bump = ctx.bumps.user_record;
        }

        user_record.completed_quests_mask |= mask;
        user_record.lp_liquidity_verified = user_record
            .lp_liquidity_verified
            .checked_add(lp_position_amount)
            .ok_or(QuestError::MathOverflow)?;
        user_record.xp_balance = user_record
            .xp_balance
            .checked_add(xp_reward)
            .ok_or(QuestError::MathOverflow)?;
        user_record.last_updated = clock.unix_timestamp;

        campaign.total_xp_awarded = campaign
            .total_xp_awarded
            .checked_add(xp_reward)
            .ok_or(QuestError::MathOverflow)?;

        emit!(QuestCompletedEvent {
            user: ctx.accounts.user.key(),
            season_id: campaign.season_id,
            quest_bit: quest_bit_flag,
            lp_amount: lp_position_amount,
            awarded_xp: xp_reward,
            total_user_xp: user_record.xp_balance,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Admin state management to toggle active epoch status
    pub fn set_campaign_state(ctx: Context<ManageCampaign>, is_active: bool) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.is_active = is_active;
        Ok(())
    }
}

/// Introspects preceding Ed25519 instruction to verify Oracle authenticity
fn verify_oracle_signature(
    sysvar_instructions: &AccountInfo,
    expected_oracle_pubkey: &[u8; 32],
    user_bytes: &[u8; 32],
    quest_bit: u8,
    lp_amount: u64,
    signature: &[u8; 64],
) -> Result<()> {
    let current_index = load_current_index_checked(sysvar_instructions)?;
    require!(current_index > 0, QuestError::MissingEd25519Verification);

    let prior_ix_index = (current_index - 1) as u16;
    let ed25519_ix: Instruction =
        load_instruction_at_checked(prior_ix_index as usize, sysvar_instructions)?;

    require!(
        ed25519_ix.program_id == ED25519_PROGRAM_ID,
        QuestError::InvalidEd25519ProgramId
    );

    // Build deterministic expected message: [user_pubkey (32) | quest_bit (1) | lp_amount_le (8)]
    let mut expected_message = Vec::with_capacity(41);
    expected_message.extend_from_slice(user_bytes);
    expected_message.push(quest_bit);
    expected_message.extend_from_slice(&lp_amount.to_le_bytes());

    // Basic offset validation for standard Solana Ed25519 instruction data layout
    // 0: num_signatures (u8 = 1)
    // 1: padding (u8 = 0)
    // 2..16: signature offsets (2 bytes each for sig_offset, sig_idx, pubkey_offset, pubkey_idx, msg_offset, msg_size, msg_idx)
    let data = ed25519_ix.data;
    require!(data.len() >= 16 + 64 + 32 + expected_message.len(), QuestError::InvalidSignatureLayout);

    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let sig_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    let extracted_pubkey = &data[pubkey_offset..pubkey_offset + 32];
    let extracted_signature = &data[sig_offset..sig_offset + 64];
    let extracted_message = &data[msg_offset..msg_offset + msg_size];

    require!(
        extracted_pubkey == expected_oracle_pubkey,
        QuestError::UnauthorizedOracleSigner
    );
    require!(
        extracted_signature == signature,
        QuestError::SignatureMismatch
    );
    require!(
        extracted_message == expected_message.as_slice(),
        QuestError::MessageIntegrityFailed
    );

    Ok(())
}

// -----------------------------------------------------------------------------
// ACCOUNTS & DATA STRUCTURES
// -----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct InitializeCampaign<'info> {
    #[account(
        init,
        payer = admin,
        space = DISCRIMINATOR_LENGTH + CampaignState::INIT_SPACE,
        seeds = [b"campaign_season", season_id.to_le_bytes().as_ref()],
        bump
    )]
    pub campaign: Account<'info, CampaignState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimQuestWithLpProof<'info> {
    #[account(mut)]
    pub campaign: Account<'info, CampaignState>,
    #[account(
        init_if_needed,
        payer = user,
        space = DISCRIMINATOR_LENGTH + UserQuestRecord::INIT_SPACE,
        seeds = [b"user_quest", user.key().as_ref(), campaign.key().as_ref()],
        bump
    )]
    pub user_record: Account<'info, UserQuestRecord>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: Inspected strictly using load_current_index_checked sysvar utility
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub sysvar_instructions: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageCampaign<'info> {
    #[account(
        mut,
        has_one = admin @ QuestError::UnauthorizedAdmin
    )]
    pub campaign: Account<'info, CampaignState>,
    pub admin: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignState {
    pub admin: Pubkey,
    pub season_id: u32,
    pub oracle_pubkey: [u8; 32],
    pub min_lp_liquidity: u64,
    pub season_end_timestamp: i64,
    pub total_participants: u64,
    pub total_xp_awarded: u64,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserQuestRecord {
    pub user: Pubkey,
    pub campaign: Pubkey,
    pub completed_quests_mask: u8,
    pub lp_liquidity_verified: u64,
    pub xp_balance: u64,
    pub last_updated: i64,
    pub bump: u8,
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------

#[event]
pub struct CampaignInitialized {
    pub season_id: u32,
    pub admin: Pubkey,
    pub min_lp_liquidity: u64,
    pub season_end_timestamp: i64,
}

#[event]
pub struct QuestCompletedEvent {
    pub user: Pubkey,
    pub season_id: u32,
    pub quest_bit: u8,
    pub lp_amount: u64,
    pub awarded_xp: u64,
    pub total_user_xp: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum QuestError {
    #[msg("Campaign is currently paused or inactive.")]
    CampaignInactive,
    #[msg("Season Zero timestamp has expired.")]
    SeasonEnded,
    #[msg("Invalid Quest bit provided. Must be within 0..7.")]
    InvalidQuestBit,
    #[msg("Provided Pump the Pool 3 LP liquidity is below minimum threshold.")]
    InsufficientLpLiquidity,
    #[msg("Quest has already been claimed for this user address.")]
    QuestAlreadyCompleted,
    #[msg("Missing Ed25519 instruction prior to execution.")]
    MissingEd25519Verification,
    #[msg("Invalid program ID for preceding instruction. Must be Ed25519.")]
    InvalidEd25519ProgramId,
    #[msg("Malformed Ed25519 signature payload header.")]
    InvalidSignatureLayout,
    #[msg("Ed25519 verification signer does not match authorized Oracle pubkey.")]
    UnauthorizedOracleSigner,
    #[msg("Provided Ed25519 signature fails verification.")]
    SignatureMismatch,
    #[msg("Signed Ed25519 message payload does not match invocation data.")]
    MessageIntegrityFailed,
    #[msg("Unauthorized admin.")]
    UnauthorizedAdmin,
    #[msg("Arithmetic overflow in calculation.")]
    MathOverflow,
}