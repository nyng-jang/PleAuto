package com.pleauto.vehicle

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.NavigationStatus
import ai.pleos.playground.navi.constants.RouteOption
import ai.pleos.playground.navi.data.BookmarkInfo
import ai.pleos.playground.navi.data.CameraAlert
import ai.pleos.playground.navi.data.CautionPoint
import ai.pleos.playground.navi.data.ChargerOperator
import ai.pleos.playground.navi.data.CurrentLocationInfo
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.DrivingInfo
import ai.pleos.playground.navi.data.RecentDestinationInfo
import ai.pleos.playground.navi.data.RouteInfo
import ai.pleos.playground.navi.data.RouteStartInfo
import ai.pleos.playground.navi.data.RouteStateInfo
import ai.pleos.playground.navi.data.TBTInfo
import ai.pleos.playground.navi.data.TripInfo
import ai.pleos.playground.navi.data.WaypointArrivedInfo
import ai.pleos.playground.navi.data.WaypointChangedInfo
import ai.pleos.playground.navi.data.WaypointInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log

/** 차량 내비 연동. Pleos가 없는 환경에서는 FakeNavigator로 바꿔 끼운다. */
interface Navigator {
    /** true면 실제 Pleos 내비 */
    val isReal: Boolean
    var onArrived: (() -> Unit)?
    var onFailure: ((String) -> Unit)?
    fun routeTo(place: Place)
    fun cancel()
    fun release()

    companion object {
        fun create(context: Context): Navigator =
            PleosNavigator.tryCreate(context) ?: FakeNavigator()
    }
}

/** 시연·개발용: 안내를 기록만 하고, 도착은 화면의 "도착 처리" 버튼으로 낸다. */
class FakeNavigator : Navigator {
    override val isReal = false
    override var onArrived: (() -> Unit)? = null
    override var onFailure: ((String) -> Unit)? = null
    override fun routeTo(place: Place) {
        Log.i(TAG, "fake route -> ${place.name}")
    }
    override fun cancel() {}
    override fun release() {}
}

/** Pleos NaviHelper 3.0.5. 콜백은 메인 스레드로 넘긴다. */
class PleosNavigator private constructor(private val helper: NaviHelper) : Navigator, NaviHelperEventListener {
    override val isReal = true
    override var onArrived: (() -> Unit)? = null
    override var onFailure: ((String) -> Unit)? = null
    private val main = Handler(Looper.getMainLooper())

    override fun routeTo(place: Place) {
        try {
            helper.requestRoute(
                RouteInfo(
                    latitude = place.lat,
                    longitude = place.lng,
                    poiId = "",
                    poiName = place.name,
                    poiSubId = "0",
                    address = place.address,
                ),
            )
        } catch (e: Exception) {
            Log.e(TAG, "requestRoute failed", e)
            onFailure?.invoke(e.message ?: "경로 요청 실패")
        }
    }

    override fun cancel() {
        runCatching { helper.cancelRoute() }
    }

    override fun release() {
        runCatching { helper.removeListener(this) }
        runCatching { helper.release() }
    }

    override fun onDestinationArrived(destinationArrivedInfo: DestinationArrivedInfo) {
        main.post { onArrived?.invoke() }
    }

    override fun onError(errorCode: NaviErrorCode) {
        main.post { onFailure?.invoke("내비 오류: $errorCode") }
    }

    // 쓰지 않는 이벤트
    override fun onRouteStarted(routeStartInfo: RouteStartInfo) {}
    override fun onRouteEnded() {}
    override fun onRoutingCompleted() {}
    override fun onReRouteEnded() {}
    override fun onRouteOptionChanged(routeOption: RouteOption) {}
    override fun onRouteCancelled() {}
    override fun onWaypointChanged(waypointChangedInfo: WaypointChangedInfo) {}
    override fun onWayPointArrived(waypointArrivedInfo: WaypointArrivedInfo) {}
    override fun onCurrentLocationInfo(currentLocationInfo: CurrentLocationInfo) {}
    override fun onRouteStateInfo(routeStateInfo: RouteStateInfo) {}
    override fun onDestinationInfo(destinationInfo: DestinationInfo) {}
    override fun onWayPointInfo(waypointInfoList: List<WaypointInfo>) {}
    override fun onRecentDestinationInfo(recentDestinationInfoList: List<RecentDestinationInfo>) {}
    override fun onBookmarkInfo(bookmarkInfoList: List<BookmarkInfo>) {}
    override fun onCurrentRoadSpeedLimit(speedLimit: Int) {}
    override fun onCameraAlert(cameraAlertList: List<CameraAlert>) {}
    override fun onDrivingInfo(drivingInfo: DrivingInfo) {}
    override fun onBookMarkChanged() {}
    override fun onDestinationChanged() {}
    override fun onNavigationStatus(status: NavigationStatus) {}
    override fun onTBTInfo(tbtInfoList: List<TBTInfo>) {}
    override fun onChargerOperatorInfo(chargerOperatorList: List<ChargerOperator>) {}
    override fun onCautionPointInfo(cautionPointList: List<CautionPoint>) {}
    override fun onTripInfo(tripInfo: TripInfo) {}

    companion object {
        /** Pleos 내비 서비스가 없으면(일반 에뮬레이터 등) null */
        fun tryCreate(context: Context): PleosNavigator? {
            var helper: NaviHelper? = null
            return try {
                helper = NaviHelper(context.applicationContext)
                helper.initialize()
                PleosNavigator(helper).also { helper.addListener(it) }
            } catch (e: Throwable) {
                Log.w(TAG, "NaviHelper unavailable, using FakeNavigator", e)
                runCatching { helper?.release() }
                null
            }
        }
    }
}

private const val TAG = "PleAuto"
