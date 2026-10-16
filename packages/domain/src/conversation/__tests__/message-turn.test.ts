import { describe, it, expect } from 'vitest';
import { resolveMessageTurn } from '../message-turn';

describe('resolveMessageTurn', () => {
  it('lets a passenger send the first message with a pending request', () => {
    expect(resolveMessageTurn({ viewerRole: 'rider', bookingStatus: 'pending', closed: false, lastSenderRole: null })).toBe('open');
  });

  it('makes a passenger wait for the driver after their message on a pending request', () => {
    expect(resolveMessageTurn({ viewerRole: 'rider', bookingStatus: 'pending', closed: false, lastSenderRole: 'rider' })).toBe(
      'awaiting_reply',
    );
  });

  it('gives the passenger the turn back once the driver replies', () => {
    expect(resolveMessageTurn({ viewerRole: 'rider', bookingStatus: 'pending', closed: false, lastSenderRole: 'driver' })).toBe('open');
  });

  it('never limits the driver', () => {
    expect(resolveMessageTurn({ viewerRole: 'driver', bookingStatus: 'pending', closed: false, lastSenderRole: 'driver' })).toBe('open');
  });

  it('lifts the limit once the request is accepted', () => {
    expect(resolveMessageTurn({ viewerRole: 'rider', bookingStatus: 'accepted', closed: false, lastSenderRole: 'rider' })).toBe('open');
  });

  it('is closed for both when the conversation is closed', () => {
    expect(resolveMessageTurn({ viewerRole: 'driver', bookingStatus: 'declined', closed: true, lastSenderRole: null })).toBe('closed');
    expect(resolveMessageTurn({ viewerRole: 'rider', bookingStatus: 'accepted', closed: true, lastSenderRole: 'driver' })).toBe('closed');
  });
});
