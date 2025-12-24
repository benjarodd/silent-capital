// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IERC7984 {
    function confidentialTransferFrom(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64 transferred);

    function confidentialTransfer(address to, euint64 amount) external returns (euint64 transferred);
}

contract SilentCapital is ZamaEthereumConfig {
    struct Campaign {
        string name;
        address creator;
        uint256 targetAmount;
        uint256 endAt;
        bool closed;
        euint64 totalRaised;
    }

    IERC7984 public immutable token;
    uint256 public campaignCount;

    mapping(uint256 campaignId => Campaign) private campaigns;
    mapping(uint256 campaignId => mapping(address contributor => euint64)) private contributions;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        string name,
        uint256 targetAmount,
        uint256 endAt
    );
    event ContributionReceived(uint256 indexed campaignId, address indexed contributor, euint64 amount);
    event CampaignClosed(uint256 indexed campaignId, address indexed creator, euint64 totalRaised);

    error CampaignNotFound(uint256 campaignId);
    error CampaignClosedAlready(uint256 campaignId);
    error CampaignEnded(uint256 campaignId, uint256 endAt);
    error InvalidEndTime(uint256 endAt);
    error InvalidName();

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Token address required");
        token = IERC7984(tokenAddress);
    }

    function createCampaign(
        string calldata name,
        uint256 targetAmount,
        uint256 endAt
    ) external returns (uint256) {
        if (bytes(name).length == 0) {
            revert InvalidName();
        }
        if (endAt <= block.timestamp) {
            revert InvalidEndTime(endAt);
        }

        uint256 campaignId = ++campaignCount;
        Campaign storage campaign = campaigns[campaignId];
        campaign.name = name;
        campaign.creator = msg.sender;
        campaign.targetAmount = targetAmount;
        campaign.endAt = endAt;
        campaign.totalRaised = FHE.asEuint64(0);
        FHE.allowThis(campaign.totalRaised);

        emit CampaignCreated(campaignId, msg.sender, name, targetAmount, endAt);
        return campaignId;
    }

    function contribute(
        uint256 campaignId,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external {
        Campaign storage campaign = _getCampaign(campaignId);
        if (campaign.closed) {
            revert CampaignClosedAlready(campaignId);
        }
        if (block.timestamp > campaign.endAt) {
            revert CampaignEnded(campaignId, campaign.endAt);
        }

        euint64 transferred = token.confidentialTransferFrom(
            msg.sender,
            address(this),
            encryptedAmount,
            inputProof
        );

        euint64 updatedContribution = FHE.add(contributions[campaignId][msg.sender], transferred);
        contributions[campaignId][msg.sender] = updatedContribution;
        FHE.allowThis(updatedContribution);
        FHE.allow(updatedContribution, msg.sender);

        euint64 updatedTotal = FHE.add(campaign.totalRaised, transferred);
        campaign.totalRaised = updatedTotal;
        FHE.allowThis(updatedTotal);
        FHE.allow(updatedTotal, campaign.creator);

        emit ContributionReceived(campaignId, msg.sender, transferred);
    }

    function closeCampaign(uint256 campaignId) external {
        Campaign storage campaign = _getCampaign(campaignId);
        if (campaign.closed) {
            revert CampaignClosedAlready(campaignId);
        }
        require(msg.sender == campaign.creator, "Only creator can close");
        campaign.closed = true;

        FHE.allowThis(campaign.totalRaised);
        token.confidentialTransfer(campaign.creator, campaign.totalRaised);

        emit CampaignClosed(campaignId, campaign.creator, campaign.totalRaised);
    }

    function campaignInfo(
        uint256 campaignId
    )
        external
        view
        returns (string memory name, address creator, uint256 targetAmount, uint256 endAt, bool closed, euint64 total)
    {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) {
            revert CampaignNotFound(campaignId);
        }
        return (campaign.name, campaign.creator, campaign.targetAmount, campaign.endAt, campaign.closed, campaign.totalRaised);
    }

    function contributionOf(uint256 campaignId, address contributor) external view returns (euint64) {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) {
            revert CampaignNotFound(campaignId);
        }
        return contributions[campaignId][contributor];
    }

    function isCampaignActive(uint256 campaignId) external view returns (bool) {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) {
            return false;
        }
        return !campaign.closed && block.timestamp <= campaign.endAt;
    }

    function _getCampaign(uint256 campaignId) internal view returns (Campaign storage) {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) {
            revert CampaignNotFound(campaignId);
        }
        return campaign;
    }
}
