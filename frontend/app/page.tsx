'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const AppPortal = dynamic(() => import('../components/AppPortal'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Initializing Campus Grievance System...
        </p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  return <AppPortal />;
}
