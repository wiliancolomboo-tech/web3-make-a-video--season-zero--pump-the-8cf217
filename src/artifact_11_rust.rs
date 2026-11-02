use anchor_lang::prelude::*;
use solana_program::ed25519_program;
use solana_program::instruction::Instruction;
use solana_program::sysvar::instructions as ix_sysvar;
use crate::state::*;
use crate::errors::SeasonZeroError;
use crate::events::SocialQuestVerified;

#[derive(Accounts)]
#[instruction(season_id: u32, quest_id: u32, points: u64)]
pub struct VerifySocialQuest<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, season_id.to_le_bytes().as_ref()],
        bump = season_config.bump,
        constraint = season_config.is_active @ SeasonZeroError::SeasonInactive
    )]
    pub season_config: Account<'info, SeasonConfig>,

    #[account(
        mut,
        seeds = [USER_SEED, season_id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump = user_profile.bump,
        has_one = user @ SeasonZeroError::Unauthorized
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(
        init,
        payer = user,
        space = QuestReceipt::LEN,
        seeds = [
            QUEST_SEED,
            season_id.to_le_bytes().as_ref(),
            quest_id.to_le_bytes().as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub quest_receipt: Account<'info, QuestReceipt>,

    /// CHECK: Instructions sysvar for introspecting prior Ed25519 verification instruction
    #[account(address = ix_sysvar::ID)]
    pub sysvar_instructions: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<VerifySocialQuest>,
    season_id: u32,
    quest_id: u32,
    points: u64,
) -> Result<()> {
    require!(quest_id < 64, SeasonZeroError::InvalidQuestId);

    let profile = &mut ctx.accounts.user_profile;
    let mask = 1u64 << quest_id;
    require!(
        (profile.quests_completed_mask & mask) == 0,
        SeasonZeroError::QuestAlreadyClaimed
    );

    // Verify Ed25519 instruction was executed immediately preceding this instruction
    let ix = ix_sysvar::load_instruction_at_checked(0, &ctx.accounts.sysvar_instructions)?;
    require!(ix.program_id == ed25519_program::ID, SeasonZeroError::InvalidOracleSignature);

    // Validate signature matches expected oracle authority and user payload
    validate_ed25519_ix(&ix, &ctx.accounts.season_config.oracle_authority, &profile.user, quest_id, season_id)?;

    let now = Clock::get()?.unix_timestamp;

    // Mark quest completed
    profile.quests_completed_mask |= mask;
    profile.quest_points = profile
        .quest_points
        .checked_add(points)
        .ok_or(SeasonZeroError::MathOverflow)?;
    profile.last_interaction_timestamp = now;

    // Record receipt
    let receipt = &mut ctx.accounts.quest_receipt;
    receipt.user = profile.user;
    receipt.quest_id = quest_id;
    receipt.season_id = season_id;
    receipt.completed_at = now;
    receipt.bump = ctx.bumps.quest_receipt;

    emit!(SocialQuestVerified {
        user: profile.user,
        quest_id,
        points_awarded: points,
        timestamp: now,
    });

    Ok(())
}

fn validate_ed25519_ix(
    ix: &Instruction,
    expected_oracle: &Pubkey,
    user: &Pubkey,
    quest_id: u32,
    season_id: u32,
) -> Result<()> {
    // Validate Ed25519 header format
    // Expected message payload: user (32 bytes) + quest_id (4 bytes) + season_id (4 bytes) = 40 bytes
    let data = &ix.data;
    require!(data.len() >= 16 + 32 + 64 + 40, SeasonZeroError::InvalidOracleSignature);

    // Public key offset in serialized instruction data
    let pubkey_offset = 16;
    let extracted_oracle = Pubkey::new_from_array(
        data[pubkey_offset..pubkey_offset + 32]
            .try_into()
            .map_err(|_| SeasonZeroError::InvalidOracleSignature)?,
    );
    require!(&extracted_oracle == expected_oracle, SeasonZeroError::Unauthorized);

    // Message payload offset
    let message_offset = 16 + 32 + 64;
    let expected_payload = [
        user.as_ref(),
        &quest_id.to_le_bytes(),
        &season_id.to_le_bytes(),
    ].concat();

    let actual_payload = &data[message_offset..message_offset + expected_payload.len()];
    require!(actual_payload == expected_payload.as_slice(), SeasonZeroError::InvalidOracleSignature);

    Ok(())
}