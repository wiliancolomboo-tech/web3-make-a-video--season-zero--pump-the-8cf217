use anchor_lang::prelude::*;
use solana_program::ed25519_program;
use solana_program::instruction::Instruction;
use crate::errors::CampaignError;
use crate::state::{CampaignConfig, UserSeasonRecord};

#[derive(Accounts)]
#[instruction(quest_id: u32)]
pub struct ClaimQuest<'info> {
    #[account(
        mut,
        seeds = [b"campaign_config", config.season_id.to_le_bytes().as_ref()],
        bump = config.bump,
        has_one = oracle_pubkey,
    )]
    pub config: Account<'info, CampaignConfig>,

    /// CHECK: Validated against config.oracle_pubkey
    pub oracle_pubkey: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserSeasonRecord::LEN,
        seeds = [b"user_record", config.season_id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_record: Account<'info, UserSeasonRecord>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Instructions sysvar checked explicitly for Ed25519 pre-instruction
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ClaimQuest>,
    quest_id: u32,
    points: u32,
    nonce: u64,
    _signature: [u8; 64],
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(config.is_active, CampaignError::CampaignInactive);
    require!(quest_id < 128, CampaignError::InvalidQuestId);

    let user_record = &mut ctx.accounts.user_record;
    if user_record.season_id == 0 {
        user_record.user = ctx.accounts.user.key();
        user_record.season_id = config.season_id;
        user_record.bump = ctx.bumps.user_record;
    }

    // Check if bitmask has quest bit set
    let mask: u128 = 1u128 << quest_id;
    require!(
        (user_record.quests_completed_mask & mask) == 0,
        CampaignError::QuestAlreadyCompleted
    );

    // Verify Ed25519 signature payload from instruction sysvar pre-check
    verify_ed25519_ix(
        &ctx.accounts.instructions_sysvar,
        &config.oracle_pubkey,
        &ctx.accounts.user.key(),
        quest_id,
        points,
        nonce,
    )?;

    // Mark quest completed
    user_record.quests_completed_mask |= mask;
    user_record.total_points = user_record
        .total_points
        .checked_add(points as u64)
        .ok_or(CampaignError::MathOverflow)?;
    user_record.last_claim_timestamp = Clock::get()?.unix_timestamp;

    config.total_points_issued = config
        .total_points_issued
        .checked_add(points as u64)
        .ok_or(CampaignError::MathOverflow)?;

    emit!(QuestCompletedEvent {
        user: ctx.accounts.user.key(),
        season_id: config.season_id,
        quest_id,
        points_awarded: points,
        total_points: user_record.total_points,
    });

    Ok(())
}

fn verify_ed25519_ix(
    sysvar_info: &AccountInfo,
    expected_oracle: &Pubkey,
    user: &Pubkey,
    quest_id: u32,
    points: u32,
    nonce: u64,
) -> Result<()> {
    let current_ix_idx = solana_program::sysvar::instructions::load_current_index_checked(sysvar_info)?;
    require!(current_ix_idx > 0, CampaignError::InvalidOracleSignature);

    let prev_ix: Instruction = solana_program::sysvar::instructions::load_instruction_at_checked(
        (current_ix_idx - 1) as usize,
        sysvar_info,
    )?;

    require!(
        prev_ix.program_id == ed25519_program::ID,
        CampaignError::InvalidOracleSignature
    );

    // Reconstruct expected serialized payload
    let mut expected_message = Vec::with_capacity(32 + 4 + 4 + 8);
    expected_message.extend_from_slice(user.as_ref());
    expected_message.extend_from_slice(&quest_id.to_le_bytes());
    expected_message.extend_from_slice(&points.to_le_bytes());
    expected_message.extend_from_slice(&nonce.to_le_bytes());

    // Validate that the instruction data includes expected pubkey and message
    require!(
        prev_ix.data.len() >= 112,
        CampaignError::InvalidOracleSignature
    );
    let pubkey_in_data = &prev_ix.data[16..48];
    require!(
        pubkey_in_data == expected_oracle.as_ref(),
        CampaignError::InvalidOracleSignature
    );

    let message_in_data = &prev_ix.data[112..];
    require!(
        message_in_data.starts_with(&expected_message),
        CampaignError::InvalidOracleSignature
    );

    Ok(())
}

#[event]
pub struct QuestCompletedEvent {
    pub user: Pubkey,
    pub season_id: u32,
    pub quest_id: u32,
    pub points_awarded: u32,
    pub total_points: u64,
}