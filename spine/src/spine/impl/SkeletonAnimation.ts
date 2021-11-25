namespace spine
{
	export class SkeletonAnimation extends egret.DisplayObjectContainer
	{
		public renderer: SkeletonRenderer;
		public state: AnimationState;
		public stateData: AnimationStateData;
		public skeleton: Skeleton;
		public skeletonData: SkeletonData;

		private lastTime: number;


		//==========自定义==============
		userEvents: UserEvent[];
		FLT_EPSILON = 1.192092896e-07;
		curEventIndex: number;//触发事件索引
		lastTriggerEventIndex: number;//上次事件索引
		isPause: boolean;
		DEFULT_FPS: number = 30;//默认30帧

		//==========自定义==============

		private _skeletonAnimationGroup: SkeletonAnimationGroup;

		private _isAddToStage: boolean;
		private _delta: number;
		private _timeScale: number = 1;

		public constructor(skeletonData: SkeletonData)
		{
			super();
			let self = this;
			self._skeletonAnimationGroup = null;
			self.lastTime = -1;
			self.renderer = new SkeletonRenderer(skeletonData);
			self.state = self.renderer.state;
			self.stateData = self.renderer.stateData;
			self.skeleton = self.renderer.skeleton;
			self.skeletonData = self.renderer.skeletonData;

			self.curEventIndex = 0;
			self.lastTriggerEventIndex = -1;
			self.userEvents = [];
			self.addChild(this.renderer);
			self.isPause = false;
			self.addEventListener(egret.Event.ADDED_TO_STAGE, self.onAddedToStage, self);
		}

		setSkeletonAnimationGroup(grp: spine.SkeletonAnimationGroup)
		{
			this._skeletonAnimationGroup = grp;
			return this;
		}

		public get flipX(): boolean
		{
			return this.renderer.scaleX == -1;
		}

		public set flipX(flip: boolean)
		{
			this.renderer.scaleX = flip ? -1 : 1;
		}

		public get flipY(): boolean
		{
			return this.renderer.scaleY == 1;
		}

		public set flipY(flip: boolean)
		{
			this.renderer.scaleY = flip ? 1 : -1;
		}

		public setTimeScale(scale: number)
		{
			let self = this;
			if (self._timeScale == scale) return;
			self._timeScale = scale;
			if (self.state)
			{
				self.state.timeScale = scale;
			}
		}

		public play(anim: string, loop = 0, trackID = 0, listener = null): Track
		{
			return this.start(trackID).add(anim, loop, listener);
		}

		public start(trackID = 0): Track
		{
			this.skeleton.setToSetupPose();
			return new Track(this, trackID);
		}

		public stop(track: number)
		{
			this.state.clearTrack(track);
			this.lastTime = -1;
		}

		public stopAll(reset?: boolean)
		{
			this.state.clearListenerNotifications();
			this.state.clearTracks();
			if (reset) this.skeleton.setToSetupPose();
			this.lastTime = -1;
		}

		//停止动画
		stopAnimation()
		{
			this.stopAll(true);
		}

		setAnimationTime(trackIndex: number, time: number)
		{
			let self = this;
			let _state = self.state;
			if (!_state) return;
			let tracksCount = _state.tracks.length;
			let _userEvents = self.userEvents;

			if (trackIndex >= 0 && trackIndex < tracksCount)
			{
				let current = _state.tracks[trackIndex];
				if (current)
				{
					self.setSkeletonTime(time);
					current.trackTime = time;
					current.trackLast = -1;
					for (let i = _userEvents.length - 1; i >= 0; --i)
					{
						let event = _userEvents[i];
						if (time > event.triggerTime && Math.abs(time - event.triggerTime) >= self.FLT_EPSILON)
						{
							self.lastTriggerEventIndex = i - 1;
							self.curEventIndex = i;
							return true;
						}
					}
				}
			}
			return false;
		}

		playAnimationInFrameIndex(trackIndex: number, aniName: string, frameIdx: number, loop: boolean)
		{
			let time = (1 / this.DEFULT_FPS) * frameIdx;
			this.playAnimationInTime(trackIndex, aniName, time, loop);
		}

		playAnimationInTime(trackIndex: number, animName: string, time: number, loop: boolean)
		{
			this.play(animName, loop ? -1 : 1, trackIndex);
			this.setAnimationTime(trackIndex, time);
		}

		//暂停到第几帧
		goToFrameIndexAndPaused(trackIndex: number, frameIndex: number)
		{
			let time = (1.0 / this.DEFULT_FPS) * (frameIndex * 1.0);
			this.goToTimeAndPaused(trackIndex, time);
		}

		goToTimeAndPaused(trackIndex: number, time: number)
		{
			this.setAnimationTime(trackIndex, time);
			this.forceRefreshAniState();
			this.pauseAnimation();
		}

		forceRefreshAniState()
		{
			let self = this;
			self.renderer.update(0);
		}

		private onAddedToStage()
		{
			let self = this;
			self._isAddToStage = true;
			self.addEventListener(egret.Event.REMOVED_FROM_STAGE, self.onRemovedFromStage, self);
		}

		private onRemovedFromStage()
		{
			let self = this;
			self._isAddToStage = false;
			self.lastTime = -1;
			self.removeEventListener(egret.Event.REMOVED_FROM_STAGE, self.onRemovedFromStage, self);
		}

		//每帧刷新
		update()
		{
			let self = this;
			if (self.isPause || !self._isAddToStage) return;

			if (self.lastTime < 0) self.lastTime = Date.now() / 1000;
			if (self._skeletonAnimationGroup)
			{
				if (self._skeletonAnimationGroup.m_bIsPause) return;

				let m_fSpeedFactor = self._skeletonAnimationGroup.m_fSpeedFactor;
				if (!isNaN(m_fSpeedFactor) && self._timeScale != m_fSpeedFactor)
				{
					self.setTimeScale(m_fSpeedFactor);
				}
			}

			let now = (Date.now() / 1000);
			self._delta = now - self.lastTime;
			if (Math.abs(self._delta) < self.FLT_EPSILON) return;

			self.renderer.update(self._delta);
			self.userEvent_update();
			self.lastTime = now;
		}

		//更新自定义事件
		userEvent_update()
		{
			let self = this;
			if (!self.state || !self.state.tracks)
			{
				return;
			}
			let userEvents = self.userEvents;
			self.curEventIndex = self.lastTriggerEventIndex + 1;
			while (self.curEventIndex < userEvents.length)
			{
				if (!self.state) break;
				let current = self.state.tracks[0];
				if (!current) break;

				let now = current.getAnimationTime();
				let event = userEvents[self.curEventIndex];
				if ((now > event.triggerTime || Math.abs(now - event.triggerTime) < self.FLT_EPSILON) &&
					(event.aniName == current.animation.name))
				{
					self.dispatchEventWith(UserEvent.EvtType, false, event);
					self.lastTriggerEventIndex = self.curEventIndex;
				}
				self.curEventIndex++;
			}
		}

		//是否存在帧事件
		isExistUserEvent(aniName: string, evtName: string)
		{
			for (let evt of this.userEvents)
			{
				if (evt.aniName == aniName && evt.evtName == evtName)
				{
					return true;
				}
			}
			return false;
		}

		//添加自定义事件 1个动作可能多个事件
		addUserEvent(aniName: string, evtName: string, time: number, data: string)
		{
			let self = this;
			if (self.isExistUserEvent(aniName, evtName))
			{
				return false;
			}
			let evt = new UserEvent(aniName, evtName, time, data);
			let userEvents = self.userEvents;
			for (let i = userEvents.length - 1; i >= 0; --i)
			{
				if (time > userEvents[i].triggerTime || Math.abs(time - userEvents[i].triggerTime) < self.FLT_EPSILON)
				{
					if (i < self.curEventIndex)
					{
						self.curEventIndex++;
					}
					userEvents[i + 1] = evt;
					return true;
				}
			}
			self.userEvents.unshift(evt);
			return true;
		}

		removeUserEvent(aniName: string, evtName: string)
		{
			let self = this;
			let userEvents = self.userEvents;
			for (let i = 0; i < userEvents.length; ++i)
			{
				if (userEvents[i].aniName == aniName && userEvents[i].evtName == evtName)
				{
					if (i <= self.curEventIndex)
					{
						self.curEventIndex--;
					}
					userEvents.splice(i, 1);
					return true;
				}
			}
			return false;
		}

		removeUserEventForAnimation(aniName: string)
		{
			let self = this;
			let userEvents = self.userEvents;
			let i = 0;
			while (i < userEvents.length)
			{
				let event = userEvents[i];
				if (event.aniName == aniName)
				{
					if (i < self.curEventIndex)
					{
						self.curEventIndex--;
					}
					userEvents.splice(i, 1);
				} else
				{
					i++;
				}
			}
		}

		cleanPrevFrameIndexCache()
		{
			this.lastTriggerEventIndex = -1;
			this.curEventIndex = 0;
		}


		//暂停动画
		pauseAnimation()
		{
			if (this.isPause)
			{
				return;
			}
			this.isPause = true;
			this.lastTime = -1;
		}

		//恢复动画
		resumeAnimation()
		{
			if (!this.isPause)
			{
				return;
			}
			this.isPause = false;
			this.lastTime = -1;
		}

		setSkeletonTime(time)
		{
			this.skeleton.time = time;
		}


		getAnimationDuration(aniName: string): number
		{
			let anim = this.skeletonData.findAnimation(aniName);
			if (anim)
			{
				return anim.duration;
			}
			return -1;
		}

		getAnimationFrames(aniName: string)
		{
			let time = this.getAnimationDuration(aniName);
			if (time < 0)
			{
				return -1;
			} else
			{
				return Math.floor(this.DEFULT_FPS * time) + 1;
			}
		}
	}
}
