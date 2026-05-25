import React from 'react';

const BRANCH_NAME = process.env.REACT_APP_BRANCH_NAME || '';

const BranchBadge = ({ className = '' }) => {
  if (!BRANCH_NAME) return null;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-amber-100 text-amber-800 border border-amber-300 shadow-sm ${className}`}
    >
      {BRANCH_NAME}
    </span>
  );
};

export default BranchBadge;
