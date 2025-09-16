import Image from 'next/image';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Avatar({ src, alt, size = 'md', className = '' }: AvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-16 h-16 text-xl'
  };

  const baseClasses = `${sizeClasses[size]} rounded-full flex items-center justify-center ${className}`;

  // If we have an image, show it
  if (src) {
    return (
      <div className={`${baseClasses} overflow-hidden border-2 border-light-gray`}>
        <Image
          src={src}
          alt={alt || 'User avatar'}
          width={size === 'sm' ? 32 : size === 'md' ? 40 : 64}
          height={size === 'sm' ? 32 : size === 'md' ? 40 : 64}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Fallback: Show initials or default avatar
  const initials = alt ? alt.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  
  return (
    <div className={`${baseClasses} bg-badger-red text-white font-display font-semibold border-2 border-badger-red`}>
      {initials}
    </div>
  );
}