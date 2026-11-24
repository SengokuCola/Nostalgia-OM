import { startDarkroom } from './looklab.js';
import labelFont from '../public/fonts/om3label.woff2?inline';

const photos = import.meta.glob('../public/samples/*.jpg', { eager: true, import: 'default', query: '?inline' });
startDarkroom({ sampleUrl: id => photos['../public/samples/' + id + '.jpg'], labelFont });
