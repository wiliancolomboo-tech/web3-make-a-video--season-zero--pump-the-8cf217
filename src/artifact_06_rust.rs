use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct CampaignConfig {
    pub admin: Pubkey,
    pub oracle_pubkey: Pubkey,
    pub pool_vault: Pubkey,
    pub season_id: u32,
    pub total_points_issued: u64,
    pub total_liquidity_pumped: u64,
    pub min_pump_amount: u64,
    pub is_active: bool,
    pub bump: u8,
}

impl CampaignConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 4 + 8 + 8 + 8 + 1 + 1;
}

#[account]
#[derive(Default)]
pub struct UserSeasonRecord {
    pub user: Pubkey,
    pub season_id: u32,
    pub total_points: u64,
    pub quests_completed_mask: u128, // Bitmask supporting up to 128 distinct quests
    pub total_pump_contributed: u64,
    pub last_claim_timestamp: i64,
    pub bump: u8,
}

impl UserSeasonRecord {
    pub const LEN: usize = 8 + 32 + 4 + 8 + 16 + 8 + 8 + 1;
}