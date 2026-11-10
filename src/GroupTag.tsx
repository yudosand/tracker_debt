import type {DebtGroup} from './debt-groups';

export default function GroupTag({group}:{group:DebtGroup}){
  return <span className={'group-tag '+(group?'group-'+group.toLowerCase():'group-none')}>{group?'Kelompok '+group:'Belum dikelompokkan'}</span>;
}
