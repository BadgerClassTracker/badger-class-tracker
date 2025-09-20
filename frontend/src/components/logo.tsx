import React from 'react';
import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const sizeClasses = {
    sm: {
      container: 'h-8',
      icon: 'w-8 h-8 text-lg',
      text: 'text-lg'
    },
    md: {
      container: 'h-10',
      icon: 'w-10 h-10 text-xl',
      text: 'text-2xl'
    },
    lg: {
      container: 'h-12',
      icon: 'w-12 h-12 text-2xl',
      text: 'text-3xl'
    }
  };

  const currentSize = sizeClasses[size];

  return (
    <Link href="/" className={`flex items-center space-x-3 ${currentSize.container} ${className} hover:opacity-80 transition-opacity cursor-pointer`}>
      {/* Logo Icon */}
      <div className={`${currentSize.icon} bg-gradient-to-br from-badger-red to-badger-red-dark rounded-xl flex items-center justify-center text-white font-bold shadow-lg`}>
        🦡
      </div>

      {/* App Name */}
      {showText && (
        <div className={`${currentSize.text} font-display font-bold text-text-dark-gray`}>
          <span className="text-text-dark-gray">Badger</span>
          <span className="text-badger-red"> Class</span>
          <span className="text-text-dark-gray"> Tracker</span>
        </div>
      )}
    </Link>
  );
};

export default Logo;