import { describe, it, expect } from 'vitest';
import { getRemainingPhotoSlots, canAddPhotoBatch, filterImageFiles } from '../lib/photoRules';

describe('Photo Limits and Rules', () => {
  it('correctly calculates remaining photo slots', () => {
    expect(getRemainingPhotoSlots(0)).toBe(10);
    expect(getRemainingPhotoSlots(5)).toBe(5);
    expect(getRemainingPhotoSlots(10)).toBe(0);
    expect(getRemainingPhotoSlots(12)).toBe(0); // non-negative boundary
    expect(getRemainingPhotoSlots(5, 50)).toBe(45); // dynamic paid plan
  });

  it('determines if a new batch can be added', () => {
    // 0 photos + 2 selected can be added
    expect(canAddPhotoBatch(0, 2)).toBe(true);

    // 9 photos + 1 selected can be added
    expect(canAddPhotoBatch(9, 1)).toBe(true);

    // 9 photos + 2 selected cannot be added
    expect(canAddPhotoBatch(9, 2)).toBe(false);

    // 10 photos + 1 selected cannot be added
    expect(canAddPhotoBatch(10, 1)).toBe(false);

    // 40 photos + 5 selected can be added under custom dynamic limit of 50
    expect(canAddPhotoBatch(40, 5, 50)).toBe(true);
  });

  it('correctly filters non-image files', () => {
    const file1 = { name: 'image.png', type: 'image/png' };
    const file2 = { name: 'doc.pdf', type: 'application/pdf' };
    const file3 = { name: 'photo.jpg', type: 'image/jpeg' };

    const filtered = filterImageFiles([file1, file2, file3]);
    expect(filtered).toHaveLength(2);
    expect(filtered).toContain(file1);
    expect(filtered).toContain(file3);
    expect(filtered).not.toContain(file2);
  });
});
