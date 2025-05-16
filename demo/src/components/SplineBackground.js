import React from 'react';
import Spline from '@splinetool/react-spline';
import './SplineBackground.css';

const SplineBackground = ({ 
  sceneUrl, 
  style = {},
  className = '',
  onLoad = () => {} 
}) => {
  return (
    <div className={`spline-background ${className}`} style={style}>
      <Spline scene={sceneUrl} onLoad={onLoad} />
    </div>
  );
};

export default SplineBackground;
