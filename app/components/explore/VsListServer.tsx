import React from 'react';
import VsListClient from './VsListClient';
import type { ExplorePage } from '../../lib/explore-page';

type VsListServerProps = {
  initialPage?: ExplorePage;
};

export default function VsListServer(props: VsListServerProps) {
  return <VsListClient {...props} />;
}
