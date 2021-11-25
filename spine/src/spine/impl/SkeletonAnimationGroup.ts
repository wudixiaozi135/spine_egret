/**
 * Created by xiaoding on 2021/3/22
 * 动画组
 */
namespace spine
{
	export class SkeletonAnimationGroup
	{
		m_fSpeedFactor: number;
		m_fTempDestFactor: number;
		m_fStep: number;
		m_bIsRunning: boolean;
		m_bIsPause: boolean;

		constructor()
		{
			let self = this;
			self.m_fSpeedFactor = 1;
			self.m_fTempDestFactor = 1;
			self.m_fStep = 0;
			self.m_bIsRunning = false;
			self.m_bIsPause = false;
		}

		/**创建一个动画组*/
		static create(): SkeletonAnimationGroup
		{
			return new SkeletonAnimationGroup();
		}

		setSpeedFactor(factor: number): void
		{
			if (this.m_fSpeedFactor == factor) return;
			this.m_fSpeedFactor = factor;
		}

		start(): void
		{
			if (this.m_bIsRunning) return;
			this.m_bIsRunning = true;
		}

		stop(): void
		{
			if (!this.m_bIsRunning) return;
			this.m_bIsPause = this.m_bIsRunning = false;
			this.m_fSpeedFactor = 1;
		}

		pause(): void
		{
			if (this.m_bIsPause) return;
			this.m_bIsPause = true;
		}

		resume(): void
		{
			if (!this.m_bIsPause) return;
			this.m_bIsPause = false;
		}

		isRunning(): boolean
		{
			return this.m_bIsRunning;
		}

		isPause(): boolean
		{
			return this.m_bIsPause;
		}
	}
}
