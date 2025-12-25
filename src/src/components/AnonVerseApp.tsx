import { useCallback, useEffect, useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';
import { isAddress } from 'viem';
import { CONTRACT_ABI, DEFAULT_CONTRACT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { decodeMessage, encodeMessage } from '../utils/crypto';
import '../styles/AnonVerse.css';

type GroupMeta = {
  id: number;
  name: string;
  creator: string;
  createdAt: number;
  memberCount: number;
  messageCount: number;
  secretHandle: string;
};

type ChatMessage = {
  sender: string;
  cipherText: string;
  timestamp: number;
  clearText?: string;
};

const formatTime = (timestamp: number) => new Date(timestamp * 1000).toLocaleString();

export function AnonVerseApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signer = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [contractAddress, setContractAddress] = useState<string>(DEFAULT_CONTRACT_ADDRESS);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [membership, setMembership] = useState<Record<number, boolean>>({});
  const [decryptedKeys, setDecryptedKeys] = useState<Record<number, number>>({});
  const [newGroupName, setNewGroupName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const targetAddress = useMemo(
    () => (isAddress(contractAddress) ? (contractAddress as `0x${string}`) : null),
    [contractAddress]
  );

  const loadMembership = useCallback(
    async (groupId: number) => {
      if (!publicClient || !targetAddress || !address) return;
      try {
        const joined = (await publicClient.readContract({
          address: targetAddress,
          abi: CONTRACT_ABI,
          functionName: 'isMember',
          args: [BigInt(groupId), address],
        })) as boolean;
        setMembership((prev) => ({ ...prev, [groupId]: joined }));
      } catch (error) {
        console.error('Membership check failed', error);
      }
    },
    [address, publicClient, targetAddress]
  );

  const loadMessages = useCallback(
    async (groupId: number) => {
      if (!publicClient || !targetAddress) return;
      setLoadingMessages(true);
      try {
        const count = (await publicClient.readContract({
          address: targetAddress,
          abi: CONTRACT_ABI,
          functionName: 'getMessageCount',
          args: [BigInt(groupId)],
        })) as bigint;

        const items: ChatMessage[] = [];
        for (let i = 0; i < Number(count); i++) {
          const { sender, cipherText, timestamp } = (await publicClient.readContract({
            address: targetAddress,
            abi: CONTRACT_ABI,
            functionName: 'getMessage',
            args: [BigInt(groupId), BigInt(i)],
          })) as { sender: string; cipherText: string; timestamp: bigint };

          const clearKey = decryptedKeys[groupId];
          items.push({
            sender,
            cipherText,
            timestamp: Number(timestamp),
            clearText: clearKey !== undefined ? decodeMessage(cipherText, clearKey) : undefined,
          });
        }
        setMessages(items);
      } catch (error) {
        console.error('Failed to load messages', error);
        setStatus('Unable to load messages right now.');
      } finally {
        setLoadingMessages(false);
      }
    },
    [decryptedKeys, publicClient, targetAddress]
  );

  const loadGroups = useCallback(async () => {
    if (!publicClient || !targetAddress) {
      setGroups([]);
      setSelectedGroupId(null);
      return;
    }
    setLoadingGroups(true);
    try {
      const count = (await publicClient.readContract({
        address: targetAddress,
        abi: CONTRACT_ABI,
        functionName: 'getGroupCount',
      })) as bigint;

      const list: GroupMeta[] = [];
      for (let i = 0; i < Number(count); i++) {
        const [name, creator, createdAt, memberCount, messageCount, secret] = (await publicClient.readContract({
          address: targetAddress,
          abi: CONTRACT_ABI,
          functionName: 'getGroup',
          args: [BigInt(i)],
        })) as [string, string, bigint, bigint, bigint, string];

        list.push({
          id: i,
          name,
          creator,
          createdAt: Number(createdAt),
          memberCount: Number(memberCount),
          messageCount: Number(messageCount),
          secretHandle: secret,
        });
      }
      setGroups(list);
      if (list.length && (selectedGroupId === null || selectedGroupId >= list.length)) {
        setSelectedGroupId(list[0].id);
      }
    } catch (error) {
      console.error('Failed to load groups', error);
      setStatus('Unable to load groups. Check the contract address.');
    } finally {
      setLoadingGroups(false);
    }
  }, [publicClient, targetAddress, selectedGroupId]);

  useEffect(() => {
    setStatus(null);
    loadGroups();
  }, [loadGroups, targetAddress]);

  useEffect(() => {
    if (selectedGroupId === null) {
      setMessages([]);
      return;
    }
    loadMessages(selectedGroupId);
    if (isConnected) {
      loadMembership(selectedGroupId);
    }
  }, [isConnected, loadMessages, loadMembership, selectedGroupId]);

  const createGroup = async () => {
    if (!targetAddress) {
      setStatus('Enter a valid Sepolia contract address first.');
      return;
    }
    if (!newGroupName.trim()) {
      setStatus('Give your room a name.');
      return;
    }
    const signerInstance = await signer;
    if (!signerInstance) {
      setStatus('Connect your wallet to create a group.');
      return;
    }
    setBusy(true);
    setStatus('Creating group...');
    try {
      const contract = new Contract(targetAddress, CONTRACT_ABI, signerInstance);
      const tx = await contract.createGroup(newGroupName.trim());
      await tx.wait();
      setNewGroupName('');
      await loadGroups();
    } catch (error) {
      console.error('Create group failed', error);
      setStatus('Failed to create group. Confirm you are on Sepolia.');
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async (groupId: number) => {
    if (!targetAddress) return setStatus('Enter a valid contract address first.');
    const signerInstance = await signer;
    if (!signerInstance) return setStatus('Connect your wallet to join.');

    setBusy(true);
    setStatus(`Joining group #${groupId}...`);
    try {
      const contract = new Contract(targetAddress, CONTRACT_ABI, signerInstance);
      const tx = await contract.joinGroup(groupId);
      await tx.wait();
      setMembership((prev) => ({ ...prev, [groupId]: true }));
      setStatus('Joined! Decrypt the key to chat.');
    } catch (error) {
      console.error('Join failed', error);
      setStatus('Could not join the group.');
    } finally {
      setBusy(false);
    }
  };

  const decryptKey = async (group: GroupMeta) => {
    if (!targetAddress || !instance || !address) {
      setStatus('Connect wallet and wait for the Zama SDK to finish loading.');
      return;
    }
    const signerInstance = await signer;
    if (!signerInstance) {
      setStatus('Wallet signer unavailable.');
      return;
    }

    setBusy(true);
    setStatus('Requesting key decryption...');
    try {
      const keypair = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '5';
      const contractAddresses = [targetAddress];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimestamp, durationDays);
      const signature = await signerInstance.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [{ handle: group.secretHandle, contractAddress: targetAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimestamp,
        durationDays
      );

      const clearKey = Number(result[group.secretHandle]);
      setDecryptedKeys((prev) => ({ ...prev, [group.id]: clearKey }));
      setStatus(`Group key decrypted for ${group.name}.`);
      await loadMessages(group.id);
    } catch (error) {
      console.error('Decrypt failed', error);
      setStatus('Unable to decrypt the key. Retry in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (selectedGroupId === null) return setStatus('Select a group first.');
    if (!newMessage.trim()) return setStatus('Type a message to send.');
    if (!targetAddress) return setStatus('Enter the deployed contract address first.');

    const key = decryptedKeys[selectedGroupId];
    if (key === undefined) return setStatus('Decrypt the group key before sending.');

    const signerInstance = await signer;
    if (!signerInstance) return setStatus('Connect your wallet to send messages.');

    setBusy(true);
    setStatus('Encrypting and sending...');
    try {
      const cipherText = encodeMessage(newMessage, key);
      const contract = new Contract(targetAddress, CONTRACT_ABI, signerInstance);
      const tx = await contract.postMessage(selectedGroupId, cipherText);
      await tx.wait();
      setNewMessage('');
      await loadMessages(selectedGroupId);
    } catch (error) {
      console.error('Send failed', error);
      setStatus('Failed to send the message.');
    } finally {
      setBusy(false);
    }
  };

  const selectedGroup = selectedGroupId !== null ? groups.find((g) => g.id === selectedGroupId) : null;
  const decryptedKey = selectedGroupId !== null ? decryptedKeys[selectedGroupId] : undefined;

  return (
    <div className="anonverse">
      <div className="stack">
        <div className="panel panel--wide">
          <div className="panel__title">Contract</div>
          <p className="panel__hint">
            Point to the Sepolia deployment of <strong>AnonVerse</strong>. ABI is bundled from the compiled contract.
          </p>
          <div className="contract-row">
            <input
              className="input"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value.trim())}
              placeholder="0x... Sepolia contract address"
            />
            <button className="ghost-button" onClick={loadGroups} disabled={!targetAddress || loadingGroups}>
              Refresh
            </button>
          </div>
          {!targetAddress && <div className="pill pill--warn">Waiting for a valid address</div>}
          {status && <div className="pill">{status}</div>}
          {zamaError && <div className="pill pill--warn">{zamaError}</div>}
        </div>

        <div className="layout">
          <div className="panel">
            <div className="panel__title">Create a room</div>
            <p className="panel__hint">
              Each room gets a fresh six-digit secret generated on-chain with Zama FHE. Members you add can decrypt it to
              encrypt chat.
            </p>
            <div className="stack stack--tight">
              <input
                className="input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Room name"
              />
              <button className="primary-button" onClick={createGroup} disabled={busy || !targetAddress}>
                {busy ? 'Working...' : 'Launch group'}
              </button>
            </div>

            <div className="panel__title" style={{ marginTop: '1.5rem' }}>
              All groups
            </div>
            {loadingGroups ? (
              <div className="muted">Syncing on-chain data…</div>
            ) : (
              <div className="group-list">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className={`group-card ${selectedGroupId === group.id ? 'group-card--active' : ''}`}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <div className="group-card__top">
                      <div>
                        <div className="group-name">{group.name}</div>
                        <div className="group-meta">
                          #{group.id} • {group.memberCount} members • {group.messageCount} messages
                        </div>
                      </div>
                      <div className="pill pill--muted">{formatTime(group.createdAt)}</div>
                    </div>
                    <div className="group-card__actions">
                      <span className="muted">Host: {group.creator.slice(0, 6)}…{group.creator.slice(-4)}</span>
                      {membership[group.id] ? (
                        <span className="pill pill--ok">Joined</span>
                      ) : (
                        <button
                          className="ghost-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            joinGroup(group.id);
                          }}
                          disabled={busy || !isConnected}
                        >
                          Join
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!groups.length && <div className="muted">No groups yet. Create the first one.</div>}
              </div>
            )}
          </div>

          <div className="panel panel--stretch">
            <div className="panel__title">Room activity</div>
            {selectedGroup ? (
              <>
                <div className="room-head">
                  <div>
                    <div className="group-name">{selectedGroup.name}</div>
                    <div className="group-meta">
                      #{selectedGroup.id} • created {formatTime(selectedGroup.createdAt)}
                    </div>
                  </div>
                  <div className="room-actions">
                    <button
                      className="ghost-button"
                      onClick={() => decryptKey(selectedGroup)}
                      disabled={busy || zamaLoading || !membership[selectedGroup.id]}
                    >
                      {decryptedKey !== undefined ? 'Key ready' : 'Decrypt key'}
                    </button>
                    {!membership[selectedGroup.id] && (
                      <button className="ghost-button" onClick={() => joinGroup(selectedGroup.id)} disabled={busy}>
                        Join to decrypt
                      </button>
                    )}
                  </div>
                </div>

                {decryptedKey !== undefined ? (
                  <div className="pill pill--ok">
                    Shared key unlocked • {String(decryptedKey).padStart(6, '0')}
                  </div>
                ) : (
                  <div className="pill pill--warn">Decrypt the room key to read and send messages.</div>
                )}

                <div className="message-list">
                  {loadingMessages ? (
                    <div className="muted">Loading messages…</div>
                  ) : (
                    messages.map((msg, idx) => (
                      <div key={`${msg.sender}-${idx}`} className="message">
                        <div className="message__meta">
                          <span className="sender">{msg.sender.slice(0, 6)}…{msg.sender.slice(-4)}</span>
                          <span className="muted">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className="message__body">
                          {msg.clearText ? (
                            <span>{msg.clearText}</span>
                          ) : (
                            <span className="muted">Encrypted: {msg.cipherText.slice(0, 42)}...</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {!messages.length && !loadingMessages && (
                    <div className="muted">No messages yet. Break the silence.</div>
                  )}
                </div>

                <div className="composer">
                  <input
                    className="input"
                    placeholder={
                      decryptedKey !== undefined ? 'Write an encrypted note…' : 'Decrypt the key before sending'
                    }
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={decryptedKey === undefined || busy}
                  />
                  <button className="primary-button" onClick={sendMessage} disabled={busy || decryptedKey === undefined}>
                    Send
                  </button>
                </div>
              </>
            ) : (
              <div className="muted">Select or create a group to see the timeline.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
