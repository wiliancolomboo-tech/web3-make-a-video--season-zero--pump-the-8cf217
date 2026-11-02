use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program::ID as ED25519_PROGRAM_ID;
use anchor_lang::solana_program::sysvar::instructions as tx_instructions;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("QuestPooL11111111111111111111111111111111111");

#[program]
pub mod pump_quest_pool {
    use super::*;

    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>,
        campaign_id: u64,
        reward_per_claim: u64,
        max_claims: u64,
        oracle_authority: Pubkey,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.campaign_id = campaign_id;
        campaign.admin = ctx.accounts.admin.key();
        campaign.reward_mint = ctx.accounts.reward_mint.key();
        campaign.reward_vault = ctx.accounts.reward_vault.key();
        campaign.oracle_authority = oracle_authority;
        campaign.reward_per_claim = reward_per_claim;
        campaign.max_claims = max_claims;
        campaign.total_claims = 0;
        campaign.bump = ctx.bumps.campaign;
        campaign.vault_bump = ctx.bumps.reward_vault;

        emit!(CampaignInitializedEvent {
            campaign_id,
            admin: campaign.admin,
            oracle_authority,
            reward_per_claim,
            max_claims,
        });

        Ok(())
    }

    pub fn verify_and_claim_reward(
        ctx: Context<VerifyAndClaimReward>,
        campaign_id: u64,
        video_hash: [u8; 32],
        social_quest_id: u64,
        oracle_sig: [u8; 64],
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        require!(
            campaign.total_claims < campaign.max_claims,
            QuestError::CampaignMaxClaimsReached
        );

        // Deterministically construct the expected attestation message
        // Format: [campaign_id: 8 bytes] + [user_pubkey: 32 bytes] + [video_hash: 32 bytes] + [social_quest_id: 8 bytes]
        let mut msg_bytes = Vec::with_capacity(80);
        msg_bytes.extend_from_slice(&campaign_id.to_le_bytes());
        msg_bytes.extend_from_slice(ctx.accounts.claimant.key.as_ref());
        msg_bytes.extend_from_slice(&video_hash);
        msg_bytes.extend_from_slice(&social_quest_id.to_le_bytes());

        // Verify ed25519 signature against oracle_authority
        // In Solana, we can verify cryptographic signatures passed in ix sysvar or use ed25519 program verification
        let instruction_sysvar = &ctx.accounts.instructions_sysvar;
        verify_ed25519_instruction(
            instruction_sysvar,
            &campaign.oracle_authority.to_bytes(),
            &msg_bytes,
            &oracle_sig,
        )?;

        // Record User Claim PDA to prevent replay attacks
        let user_claim = &mut ctx.accounts.user_claim;
        user_claim.campaign_id = campaign_id;
        user_claim.claimant = ctx.accounts.claimant.key();
        user_claim.video_hash = video_hash;
        user_claim.social_quest_id = social_quest_id;
        user_claim.claimed_at = Clock::get()?.unix_timestamp;
        user_claim.reward_amount = campaign.reward_per_claim;
        user_claim.bump = ctx.bumps.user_claim;

        campaign.total_claims = campaign
            .total_claims
            .checked_add(1)
            .ok_or(QuestError::MathOverflow)?;

        // Transfer SPL Token Reward from PDA Vault to Claimant
        let campaign_id_bytes = campaign_id.to_le_bytes();
        let seeds = &[
            b"campaign_vault".as_ref(),
            campaign_id_bytes.as_ref(),
            &[campaign.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reward_vault.to_account_info(),
                to: ctx.accounts.claimant_token_account.to_account_info(),
                authority: ctx.accounts.reward_vault.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, campaign.reward_per_claim)?;

        emit!(RewardClaimedEvent {
            campaign_id,
            claimant: ctx.accounts.claimant.key(),
            video_hash,
            social_quest_id,
            reward_amount: campaign.reward_per_claim,
            timestamp: user_claim.claimed_at,
        });

        Ok(())
    }
}

// Security Helper to verify ed25519 pre-instruction
pub fn verify_ed25519_instruction(
    instruction_sysvar: &AccountInfo,
    expected_pubkey: &[u8; 32],
    expected_msg: &[u8],
    expected_sig: &[u8; 64],
) -> Result<()> {
    let current_index = tx_instructions::load_current_index_checked(instruction_sysvar)
        .map_err(|_| QuestError::InstructionSysvarError)?;

    // Signature verification must precede this instruction in the same atomic transaction
    require!(current_index > 0, QuestError::MissingEd25519PreInstruction);

    let prior_ix = tx_instructions::load_instruction_at_checked(
        (current_index - 1) as usize,
        instruction_sysvar,
    )
    .map_err(|_| QuestError::InstructionSysvarError)?;

    require!(
        prior_ix.program_id == ED25519_PROGRAM_ID,
        QuestError::InvalidEd25519ProgramId
    );

    // Parse Solana Ed25519 Signature Verification Program instruction data layout
    let data = prior_ix.data;
    require!(data.len() >= 16 + 64 + 32, QuestError::MalformedEd25519Data);

    // Extract signature, public key, and payload according to standard Solana ed25519 ix format
    let num_signatures = data[0];
    require!(num_signatures == 1, QuestError::InvalidSignatureCount);

    let signature_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    let extracted_sig = &data[signature_offset..signature_offset + 64];
    let extracted_pubkey = &data[pubkey_offset..pubkey_offset + 32];
    let extracted_message = &data[message_offset..message_offset + message_size];

    require!(
        extracted_pubkey == expected_pubkey,
        QuestError::OraclePubkeyMismatch
    );
    require!(extracted_sig == expected_sig, QuestError::OracleSigMismatch);
    require!(
        extracted_message == expected_msg,
        QuestError::OraclePayloadMismatch
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub partial struct InitializeCampaign<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [b"campaign", campaign_id.to_le_bytes().as_ref()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    pub reward_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"campaign_vault", campaign_id.to_le_bytes().as_ref()],
        bump,
        token::mint = reward_mint,
        token::authority = reward_vault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(campaign_id: u64, video_hash: [u8; 32], social_quest_id: u64)]
pub partial struct VerifyAndClaimReward<'info> {
    #[account(
        mut,
        seeds = [b"campaign", campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        seeds = [b"campaign_vault", campaign_id.to_le_bytes().as_ref()],
        bump = campaign.vault_bump
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = claimant,
        space = 8 + UserClaim::INIT_SPACE,
        seeds = [
            b"user_claim",
            campaign_id.to_le_bytes().as_ref(),
            claimant.key().as_ref()
        ],
        bump
    )]
    pub user_claim: Account<'info, UserClaim>,

    #[account(
        mut,
        constraint = claimant_token_account.mint == campaign.reward_mint @ QuestError::InvalidMint,
        constraint = claimant_token_account.owner == claimant.key() @ QuestError::InvalidTokenAccountOwner
    )]
    pub claimant_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub claimant: Signer<'info>,

    /// CHECK: Instructions sysvar account for verifying Ed25519 signature
    #[account(address = tx_instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub campaign_id: u64,
    pub admin: Pubkey,
    pub reward_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub oracle_authority: Pubkey,
    pub reward_per_claim: u64,
    pub max_claims: u64,
    pub total_claims: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserClaim {
    pub campaign_id: u64,
    pub claimant: Pubkey,
    pub video_hash: [u8; 32],
    pub social_quest_id: u64,
    pub claimed_at: i64,
    pub reward_amount: u64,
    pub bump: u8,
}

#[event]
pub struct CampaignInitializedEvent {
    pub campaign_id: u64,
    pub admin: Pubkey,
    pub oracle_authority: Pubkey,
    pub reward_per_claim: u64,
    pub max_claims: u64,
}

#[event]
pub struct RewardClaimedEvent {
    pub campaign_id: u64,
    pub claimant: Pubkey,
    pub video_hash: [u8; 32],
    pub social_quest_id: u64,
    pub reward_amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum QuestError {
    #[msg("Campaign max claims limit has been reached")]
    CampaignMaxClaimsReached,
    #[msg("Math calculation resulted in an overflow")]
    MathOverflow,
    #[msg("Missing required Ed25519 pre-instruction in current transaction")]
    MissingEd25519PreInstruction,
    #[msg("Invalid program ID for Ed25519 signature verification")]
    InvalidEd25519ProgramId,
    #[msg("Malformed Ed25519 instruction data layout")]
    MalformedEd25519Data,
    #[msg("Only single signature verification is supported")]
    InvalidSignatureCount,
    #[msg("Oracle public key does not match campaign authority")]
    OraclePubkeyMismatch,
    #[msg("Oracle signature does not match attested signature")]
    OracleSigMismatch,
    #[msg("Oracle payload does not match claimed video and quest")]
    OraclePayloadMismatch,
    #[msg("Failed reading from instructions sysvar")]
    InstructionSysvarError,
    #[msg("Token account mint mismatch")]
    InvalidMint,
    #[msg("Token account owner must be claimant")]
    InvalidTokenAccountOwner,
}