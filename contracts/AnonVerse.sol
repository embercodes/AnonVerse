// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Encrypted group chat for AnonVerse
/// @notice Handles group creation, membership, and encrypted message storage using a shared FHE key.
contract AnonVerse is ZamaEthereumConfig {
    struct GroupMetadata {
        string name;
        address creator;
        euint32 secret;
        uint256 createdAt;
        uint256 memberCount;
        uint256 messageCount;
    }

    struct Message {
        address sender;
        string cipherText;
        uint256 timestamp;
    }

    GroupMetadata[] private groups;
    mapping(uint256 => mapping(address => bool)) private groupMembers;
    mapping(uint256 => address[]) private memberLists;
    mapping(uint256 => Message[]) private groupMessages;

    event GroupCreated(uint256 indexed groupId, address indexed creator, string name, euint32 encryptedKey);
    event MemberJoined(uint256 indexed groupId, address indexed member);
    event MessagePosted(uint256 indexed groupId, address indexed sender, string cipherText, uint256 timestamp);

    modifier validGroup(uint256 groupId) {
        require(groupId < groups.length, "Invalid group");
        _;
    }

    /// @notice Create a new group with a random six-digit FHE-shielded key.
    /// @param name The readable group name.
    /// @return groupId The newly created group id.
    /// @return encryptedKey The encrypted six-digit key shared with members.
    function createGroup(string calldata name) external returns (uint256 groupId, euint32 encryptedKey) {
        require(bytes(name).length > 0, "Group name required");

        euint32 secret = FHE.rem(FHE.randEuint32(), 1_000_000);

        groupId = groups.length;
        groups.push(
            GroupMetadata({
                name: name,
                creator: msg.sender,
                secret: secret,
                createdAt: block.timestamp,
                memberCount: 1,
                messageCount: 0
            })
        );

        groupMembers[groupId][msg.sender] = true;
        memberLists[groupId].push(msg.sender);

        FHE.allow(secret, msg.sender);
        FHE.allowThis(secret);

        emit GroupCreated(groupId, msg.sender, name, secret);
        return (groupId, secret);
    }

    /// @notice Join an existing group and receive decrypt permissions for its key.
    /// @param groupId The group to join.
    function joinGroup(uint256 groupId) external validGroup(groupId) {
        require(!groupMembers[groupId][msg.sender], "Already joined");

        groupMembers[groupId][msg.sender] = true;
        memberLists[groupId].push(msg.sender);
        groups[groupId].memberCount += 1;

        FHE.allow(groups[groupId].secret, msg.sender);

        emit MemberJoined(groupId, msg.sender);
    }

    /// @notice Post an encrypted message to a group.
    /// @param groupId The target group id.
    /// @param cipherText The message encrypted off-chain with the group's shared key.
    function postMessage(uint256 groupId, string calldata cipherText) external validGroup(groupId) {
        require(groupMembers[groupId][msg.sender], "Join first");
        require(bytes(cipherText).length > 0, "Message required");

        groupMessages[groupId].push(
            Message({sender: msg.sender, cipherText: cipherText, timestamp: block.timestamp})
        );
        groups[groupId].messageCount += 1;

        emit MessagePosted(groupId, msg.sender, cipherText, block.timestamp);
    }

    /// @notice Get metadata for a group.
    function getGroup(uint256 groupId)
        external
        view
        validGroup(groupId)
        returns (string memory, address, uint256, uint256, uint256, euint32)
    {
        GroupMetadata storage group = groups[groupId];
        return (group.name, group.creator, group.createdAt, group.memberCount, group.messageCount, group.secret);
    }

    /// @notice Return the total number of groups.
    function getGroupCount() external view returns (uint256) {
        return groups.length;
    }

    /// @notice Retrieve the encrypted key for a group.
    function getGroupSecret(uint256 groupId) external view validGroup(groupId) returns (euint32) {
        return groups[groupId].secret;
    }

    /// @notice List members for a group.
    function listMembers(uint256 groupId) external view validGroup(groupId) returns (address[] memory) {
        return memberLists[groupId];
    }

    /// @notice Return whether an address has joined a group.
    function isMember(uint256 groupId, address account) external view validGroup(groupId) returns (bool) {
        return groupMembers[groupId][account];
    }

    /// @notice Return the number of messages in a group.
    function getMessageCount(uint256 groupId) external view validGroup(groupId) returns (uint256) {
        return groupMessages[groupId].length;
    }

    /// @notice Get a single encrypted message by index.
    function getMessage(uint256 groupId, uint256 index)
        external
        view
        validGroup(groupId)
        returns (Message memory)
    {
        require(index < groupMessages[groupId].length, "Invalid message index");
        return groupMessages[groupId][index];
    }
}
