/**
 * Created by xiaoding on 2021/1/31
 * 用户自定义帧事件
 */
module spine
{
	export class UserEvent
	{
		static EvtType = "UserEvent";

		//动画名
		aniName: string;
		//事件名
		evtName: string;
		//触发时间
		triggerTime: number;
		//事件参数 JSON
		data: any;

		constructor(aniName: string, evtName: string, triggerTime: number, data: any)
		{
			this.aniName = aniName;
			this.evtName = evtName;
			this.triggerTime = triggerTime;
			this.data = data;
		}

	}
}
