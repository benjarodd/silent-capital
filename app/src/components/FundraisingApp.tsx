import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { isAddress } from 'viem';

import { FUNDRAISING_ABI, FHEETH_ABI, DEFAULT_FHEETH_ADDRESS, DEFAULT_FUNDRAISING_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { Header } from './Header';
import '../styles/FundraisingApp.css';

const DECIMALS = 6;

const formatAmount = (value: bigint) => {
  return ethers.formatUnits(value, DECIMALS);
};

const parseAmount = (value: string) => {
  if (!value) {
    return 0n;
  }
  return ethers.parseUnits(value, DECIMALS);
};

const parseDecryptedValue = (value: unknown) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    return BigInt(value);
  }
  return 0n;
};

export function FundraisingApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [fundraisingAddressInput, setFundraisingAddressInput] = useState(DEFAULT_FUNDRAISING_ADDRESS);
  const [tokenAddressInput, setTokenAddressInput] = useState(DEFAULT_FHEETH_ADDRESS);

  const fundraisingAddress = useMemo(
    () => (isAddress(fundraisingAddressInput) ? (fundraisingAddressInput as `0x${string}`) : undefined),
    [fundraisingAddressInput],
  );
  const tokenAddress = useMemo(
    () => (isAddress(tokenAddressInput) ? (tokenAddressInput as `0x${string}`) : undefined),
    [tokenAddressInput],
  );

  const [activeCampaignId, setActiveCampaignId] = useState<number>(0);
  const [campaignName, setCampaignName] = useState('');
  const [campaignTarget, setCampaignTarget] = useState('');
  const [campaignEnd, setCampaignEnd] = useState(() => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return future.toISOString().slice(0, 16);
  });

  const [contributionAmount, setContributionAmount] = useState('');
  const [operatorDays, setOperatorDays] = useState('7');
  const [mintAmount, setMintAmount] = useState('');

  const [decryptedTotal, setDecryptedTotal] = useState<string | null>(null);
  const [decryptedContribution, setDecryptedContribution] = useState<string | null>(null);
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);

  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const resetStatus = () => {
    setActionStatus(null);
    setActionError(null);
  };

  const { data: campaignCount } = useReadContract({
    address: fundraisingAddress,
    abi: FUNDRAISING_ABI,
    functionName: 'campaignCount',
    query: {
      enabled: !!fundraisingAddress,
    },
  });

  const campaignCountNumber = campaignCount ? Number(campaignCount) : 0;

  useEffect(() => {
    if (!activeCampaignId && campaignCountNumber > 0) {
      setActiveCampaignId(campaignCountNumber);
    }
  }, [activeCampaignId, campaignCountNumber]);

  const { data: campaignInfo } = useReadContract({
    address: fundraisingAddress,
    abi: FUNDRAISING_ABI,
    functionName: 'campaignInfo',
    args: activeCampaignId ? [BigInt(activeCampaignId)] : undefined,
    query: {
      enabled: !!fundraisingAddress && activeCampaignId > 0,
    },
  });

  const { data: campaignActive } = useReadContract({
    address: fundraisingAddress,
    abi: FUNDRAISING_ABI,
    functionName: 'isCampaignActive',
    args: activeCampaignId ? [BigInt(activeCampaignId)] : undefined,
    query: {
      enabled: !!fundraisingAddress && activeCampaignId > 0,
    },
  });

  const { data: contributionHandle } = useReadContract({
    address: fundraisingAddress,
    abi: FUNDRAISING_ABI,
    functionName: 'contributionOf',
    args: activeCampaignId && address ? [BigInt(activeCampaignId), address] : undefined,
    query: {
      enabled: !!fundraisingAddress && !!address && activeCampaignId > 0,
    },
  });

  const { data: tokenBalanceHandle } = useReadContract({
    address: tokenAddress,
    abi: FHEETH_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!tokenAddress && !!address,
    },
  });

  const { data: operatorActive } = useReadContract({
    address: tokenAddress,
    abi: FHEETH_ABI,
    functionName: 'isOperator',
    args: address && fundraisingAddress ? [address, fundraisingAddress] : undefined,
    query: {
      enabled: !!tokenAddress && !!address && !!fundraisingAddress,
    },
  });

  const campaignDetails = useMemo(() => {
    if (!campaignInfo) {
      return null;
    }
    const [name, creator, targetAmount, endAt, closed, totalRaised] = campaignInfo as [
      string,
      `0x${string}`,
      bigint,
      bigint,
      boolean,
      `0x${string}`,
    ];
    return { name, creator, targetAmount, endAt, closed, totalRaised };
  }, [campaignInfo]);

  const isCreator =
    !!campaignDetails && !!address && campaignDetails.creator.toLowerCase() === address.toLowerCase();

  const handleDecrypt = async (handle: `0x${string}`, contractAddress: `0x${string}`) => {
    if (!instance || !address || !signerPromise) {
      setActionError('Connect your wallet and wait for encryption to initialize.');
      return null;
    }

    try {
      const signer = await signerPromise;
      if (!signer) {
        setActionError('Signer not available.');
        return null;
      }

      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [contractAddress];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        [{ handle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      return parseDecryptedValue(result[handle]);
    } catch (error) {
      console.error('Decryption failed:', error);
      setActionError('Unable to decrypt. Ensure you have access permissions.');
      return null;
    }
  };

  const handleCreateCampaign = async () => {
    resetStatus();
    if (!fundraisingAddress) {
      setActionError('Enter a valid fundraising contract address.');
      return;
    }
    if (!campaignName.trim()) {
      setActionError('Campaign name is required.');
      return;
    }
    if (!campaignEnd) {
      setActionError('Select a campaign end time.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setActionError('Connect your wallet to create a campaign.');
      return;
    }

    try {
      const endTimestamp = Math.floor(new Date(campaignEnd).getTime() / 1000);
      const targetAmount = parseAmount(campaignTarget);

      const contract = new Contract(fundraisingAddress, FUNDRAISING_ABI, signer);
      const tx = await contract.createCampaign(campaignName, targetAmount, endTimestamp);
      setActionStatus('Creating campaign...');
      await tx.wait();
      setActionStatus('Campaign created.');
      setCampaignName('');
      setCampaignTarget('');
    } catch (error) {
      console.error('Create campaign error:', error);
      setActionError('Failed to create campaign.');
    }
  };

  const handleGrantOperator = async () => {
    resetStatus();
    if (!tokenAddress || !fundraisingAddress) {
      setActionError('Enter valid contract addresses.');
      return;
    }
    const signer = await signerPromise;
    if (!signer) {
      setActionError('Connect your wallet to approve operator.');
      return;
    }

    try {
      const days = Number(operatorDays);
      if (!Number.isFinite(days) || days <= 0) {
        setActionError('Enter a valid number of days.');
        return;
      }
      const durationSeconds = Math.max(1, days) * 24 * 60 * 60;
      const until = Math.floor(Date.now() / 1000) + durationSeconds;

      const contract = new Contract(tokenAddress, FHEETH_ABI, signer);
      const tx = await contract.setOperator(fundraisingAddress, until);
      setActionStatus('Granting operator permissions...');
      await tx.wait();
      setActionStatus('Operator permissions granted.');
    } catch (error) {
      console.error('Operator approval error:', error);
      setActionError('Failed to grant operator.');
    }
  };

  const handleContribute = async () => {
    resetStatus();
    if (!fundraisingAddress || !tokenAddress) {
      setActionError('Enter valid contract addresses.');
      return;
    }
    if (!instance) {
      setActionError('Encryption service is not ready.');
      return;
    }
    if (!address) {
      setActionError('Connect your wallet to contribute.');
      return;
    }
    if (!activeCampaignId) {
      setActionError('Select a campaign.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setActionError('Signer not available.');
      return;
    }

    try {
      const amount = parseAmount(contributionAmount);
      if (amount <= 0n) {
        setActionError('Enter a contribution amount.');
        return;
      }

      const input = instance.createEncryptedInput(tokenAddress, fundraisingAddress);
      input.add64(amount);
      const encryptedInput = await input.encrypt();

      const contract = new Contract(fundraisingAddress, FUNDRAISING_ABI, signer);
      const tx = await contract.contribute(
        BigInt(activeCampaignId),
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      setActionStatus('Submitting encrypted contribution...');
      await tx.wait();
      setActionStatus('Contribution confirmed.');
      setContributionAmount('');
    } catch (error) {
      console.error('Contribution error:', error);
      setActionError('Contribution failed. Check operator approval and balance.');
    }
  };

  const handleCloseCampaign = async () => {
    resetStatus();
    if (!fundraisingAddress) {
      setActionError('Enter a valid fundraising contract address.');
      return;
    }
    if (!activeCampaignId) {
      setActionError('Select a campaign.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setActionError('Connect your wallet to close the campaign.');
      return;
    }

    try {
      const contract = new Contract(fundraisingAddress, FUNDRAISING_ABI, signer);
      const tx = await contract.closeCampaign(BigInt(activeCampaignId));
      setActionStatus('Closing campaign...');
      await tx.wait();
      setActionStatus('Campaign closed and funds transferred.');
    } catch (error) {
      console.error('Close campaign error:', error);
      setActionError('Failed to close campaign.');
    }
  };

  const handleMint = async () => {
    resetStatus();
    if (!tokenAddress) {
      setActionError('Enter a valid token contract address.');
      return;
    }

    const signer = await signerPromise;
    if (!signer || !address) {
      setActionError('Connect your wallet to mint.');
      return;
    }

    try {
      const amount = parseAmount(mintAmount);
      if (amount <= 0n) {
        setActionError('Enter an amount to mint.');
        return;
      }

      const contract = new Contract(tokenAddress, FHEETH_ABI, signer);
      const tx = await contract.mint(address, amount);
      setActionStatus('Minting fETH...');
      await tx.wait();
      setActionStatus('Mint complete.');
      setMintAmount('');
    } catch (error) {
      console.error('Mint error:', error);
      setActionError('Mint failed.');
    }
  };

  const handleDecryptTotal = async () => {
    resetStatus();
    if (!campaignDetails?.totalRaised || !fundraisingAddress) {
      setActionError('No campaign total available.');
      return;
    }
    const decrypted = await handleDecrypt(campaignDetails.totalRaised, fundraisingAddress);
    if (decrypted !== null) {
      setDecryptedTotal(formatAmount(decrypted));
      setActionStatus('Total decrypted.');
    }
  };

  const handleDecryptContribution = async () => {
    resetStatus();
    if (!contributionHandle || !fundraisingAddress) {
      setActionError('No contribution recorded yet.');
      return;
    }
    const decrypted = await handleDecrypt(contributionHandle as `0x${string}`, fundraisingAddress);
    if (decrypted !== null) {
      setDecryptedContribution(formatAmount(decrypted));
      setActionStatus('Contribution decrypted.');
    }
  };

  const handleDecryptBalance = async () => {
    resetStatus();
    if (!tokenBalanceHandle || !tokenAddress) {
      setActionError('No balance available.');
      return;
    }
    const decrypted = await handleDecrypt(tokenBalanceHandle as `0x${string}`, tokenAddress);
    if (decrypted !== null) {
      setDecryptedBalance(formatAmount(decrypted));
      setActionStatus('Balance decrypted.');
    }
  };

  return (
    <div className="fundraising-app">
      <Header />
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Silent Capital</p>
          <h2>Confidential fundraising for founders who value privacy.</h2>
          <p className="hero-subtitle">
            Launch a campaign, accept encrypted fETH contributions, and reveal totals only to authorized wallets.
          </p>
          <div className="hero-tags">
            <span>Encrypted balances</span>
            <span>Creator-controlled close</span>
            <span>Relayer decryption</span>
          </div>
        </div>
        <div className="hero-card">
          <h3>Campaign Network Setup</h3>
          <p>Provide your deployed contract addresses to start.</p>
          <label className="field-label">
            Fundraising Contract
            <input
              value={fundraisingAddressInput}
              onChange={(event) => setFundraisingAddressInput(event.target.value.trim())}
              placeholder="0x..."
            />
          </label>
          <label className="field-label">
            fETH Token Contract
            <input
              value={tokenAddressInput}
              onChange={(event) => setTokenAddressInput(event.target.value.trim())}
              placeholder="0x..."
            />
          </label>
          <div className="status-row">
            <span className={fundraisingAddress ? 'status-pill success' : 'status-pill warning'}>
              Fundraising {fundraisingAddress ? 'ready' : 'missing'}
            </span>
            <span className={tokenAddress ? 'status-pill success' : 'status-pill warning'}>
              Token {tokenAddress ? 'ready' : 'missing'}
            </span>
          </div>
          {zamaError && <p className="error-text">{zamaError}</p>}
          {zamaLoading && <p className="helper-text">Encryption network warming up...</p>}
        </div>
      </section>

      <section className="grid two-col">
        <div className="card">
          <div className="card-header">
            <h3>Create a Campaign</h3>
            <p>Set your name, target, and end time.</p>
          </div>
          <label className="field-label">
            Campaign name
            <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Seed Round" />
          </label>
          <label className="field-label">
            Target amount (fETH)
            <input
              value={campaignTarget}
              onChange={(event) => setCampaignTarget(event.target.value)}
              placeholder="150.00"
            />
          </label>
          <label className="field-label">
            End date
            <input
              type="datetime-local"
              value={campaignEnd}
              onChange={(event) => setCampaignEnd(event.target.value)}
            />
          </label>
          <button className="primary" onClick={handleCreateCampaign}>
            Create campaign
          </button>
          <p className="helper-text">Target amount uses 6 decimals to match fETH.</p>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Contribute Encrypted fETH</h3>
            <p>Approve operator access, then send encrypted amounts.</p>
          </div>
          <label className="field-label">
            Operator duration (days)
            <input
              value={operatorDays}
              onChange={(event) => setOperatorDays(event.target.value)}
              placeholder="7"
            />
          </label>
          <button className="secondary" onClick={handleGrantOperator} disabled={!fundraisingAddress || !tokenAddress}>
            Grant operator
          </button>
          <div className="inline-status">
            <span>{operatorActive ? 'Operator active' : 'Operator not set'}</span>
          </div>
          <label className="field-label">
            Contribution amount (fETH)
            <input
              value={contributionAmount}
              onChange={(event) => setContributionAmount(event.target.value)}
              placeholder="5.25"
            />
          </label>
          <button className="primary" onClick={handleContribute} disabled={!campaignActive}>
            Submit encrypted contribution
          </button>
          <p className="helper-text">
            {campaignActive ? 'Campaign is active.' : 'Campaign is closed or expired.'}
          </p>
        </div>
      </section>

      <section className="grid two-col">
        <div className="card">
          <div className="card-header">
            <h3>Campaign Overview</h3>
            <p>Monitor totals and decrypt when you have access.</p>
          </div>
          {campaignCountNumber === 0 ? (
            <p className="helper-text">No campaigns yet. Create the first one above.</p>
          ) : (
            <>
              <label className="field-label">
                Select campaign
                <select
                  value={activeCampaignId}
                  onChange={(event) => setActiveCampaignId(Number(event.target.value))}
                >
                  {Array.from({ length: campaignCountNumber }, (_, index) => index + 1).map((id) => (
                    <option key={`campaign-${id}`} value={id}>
                      Campaign #{id}
                    </option>
                  ))}
                </select>
              </label>
              {campaignDetails && (
                <div className="campaign-details">
                  <div>
                    <span>Name</span>
                    <strong>{campaignDetails.name}</strong>
                  </div>
                  <div>
                    <span>Creator</span>
                    <strong>{campaignDetails.creator}</strong>
                  </div>
                  <div>
                    <span>Target</span>
                    <strong>{formatAmount(campaignDetails.targetAmount)} fETH</strong>
                  </div>
                  <div>
                    <span>Ends</span>
                    <strong>{new Date(Number(campaignDetails.endAt) * 1000).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{campaignDetails.closed ? 'Closed' : 'Open'}</strong>
                  </div>
                  <div>
                    <span>Encrypted total</span>
                    <strong className="mono">{campaignDetails.totalRaised}</strong>
                  </div>
                </div>
              )}
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={handleDecryptTotal}
                  disabled={!campaignDetails || !isCreator}
                >
                  Decrypt total
                </button>
                <button
                  className="ghost"
                  onClick={handleCloseCampaign}
                  disabled={!campaignDetails || !isCreator}
                >
                  Close campaign
                </button>
              </div>
              {decryptedTotal && (
                <div className="highlight-box">
                  <p>Decrypted total: {decryptedTotal} fETH</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Your Wallet</h3>
            <p>View your encrypted balances and contribution record.</p>
          </div>
          <label className="field-label">
            Mint test fETH
            <input
              value={mintAmount}
              onChange={(event) => setMintAmount(event.target.value)}
              placeholder="25.00"
            />
          </label>
          <button className="secondary" onClick={handleMint} disabled={!tokenAddress}>
            Mint fETH
          </button>
          <div className="wallet-section">
            <div>
              <span>Encrypted balance</span>
              <strong className="mono">{tokenBalanceHandle ? (tokenBalanceHandle as string) : 'N/A'}</strong>
            </div>
            <button className="ghost" onClick={handleDecryptBalance} disabled={!tokenBalanceHandle}>
              Decrypt balance
            </button>
            {decryptedBalance && (
              <p className="highlight-box">Balance: {decryptedBalance} fETH</p>
            )}
          </div>
          <div className="wallet-section">
            <div>
              <span>Your encrypted contribution</span>
              <strong className="mono">{contributionHandle ? (contributionHandle as string) : 'N/A'}</strong>
            </div>
            <button className="ghost" onClick={handleDecryptContribution} disabled={!contributionHandle}>
              Decrypt contribution
            </button>
            {decryptedContribution && (
              <p className="highlight-box">Contribution: {decryptedContribution} fETH</p>
            )}
          </div>
        </div>
      </section>

      {(actionStatus || actionError) && (
        <div className="action-footer">
          {actionStatus && <span className="status-message">{actionStatus}</span>}
          {actionError && <span className="error-message">{actionError}</span>}
        </div>
      )}
    </div>
  );
}
