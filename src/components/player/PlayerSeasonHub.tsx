import {useState} from 'react';
import PlayerRatingPeriods,{type RatingPeriodSummary} from './PlayerRatingPeriods.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';
export default function PlayerSeasonHub({playerId,onOpenGame,initialArchive=false}:{playerId:string;onOpenGame?:(key:string)=>void;initialArchive?:boolean}){
 const [period,setPeriod]=useState<RatingPeriodSummary|null>(null);
 const[empty,setEmpty]=useState(false);
 return <><PlayerRatingPeriods playerId={playerId} onOpenGame={onOpenGame} onPeriodChange={setPeriod} onEmptyChange={setEmpty} initialArchive={initialArchive}/>{period&&period.type.toUpperCase()==='RATING'&&<PlayerSeasonsPanel key={period.id} part="period" periodKey={`period:${period.id}`}/>} {empty&&<PlayerSeasonsPanel part={initialArchive?'history':'season'}/>}</>;
}
