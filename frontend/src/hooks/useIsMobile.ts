/**
 * useIsMobile - Custom hook for responsive detection
 * Returns true when viewport width is below the mobile breakpoint (768px)
 */
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const NARROW_BREAKPOINT = 1024;

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Call handler right away to set initial value correctly
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

/**
 * useIsNarrow - Custom hook for narrow layout detection
 * Returns true when viewport width is below 1024px
 * Use this for editor pages that need more space before stacking
 */
export const useIsNarrow = (): boolean => {
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < NARROW_BREAKPOINT : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsNarrow(window.innerWidth < NARROW_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isNarrow;
};

export default useIsMobile;
