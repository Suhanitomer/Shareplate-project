import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, LogOut, MapPin, Radio, Route, Truck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { api, type DeliveryRequest } from "@/lib/api";
import { geocodeAddress } from "@/lib/geocoding";
import { clearUserSession, getStoredUser } from "@/lib/session";
import LiveBadge from "@/components/LiveBadge";
import Map from "@/components/Map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FRESH_VOLUNTEER_WINDOW_MS = 72 * 60 * 60 * 1000;

const nextDeliveryState: Record<DeliveryRequest["delivery_status"], DeliveryRequest["delivery_status"] | null> = {
  pending: null,
  assigned: "picked",
  picked: "delivering",
  delivering: "delivered",
  delivered: null,
};

const buildDummyDestination = (pickupLat: number, pickupLng: number) => ({
  latitude: pickupLat + 0.015,
  longitude: pickupLng + 0.015,
});

const getDeliveryMapData = (request: DeliveryRequest) => {
  const pickupLat = request.item_details.latitude;
  const pickupLng = request.item_details.longitude;
  const realRecipientLat = request.recipient_location?.latitude ?? request.recipient_latitude;
  const realRecipientLng = request.recipient_location?.longitude ?? request.recipient_longitude;
  const dummyRecipient =
    Number.isFinite(pickupLat) && Number.isFinite(pickupLng) ? buildDummyDestination(pickupLat as number, pickupLng as number) : null;
  const recipientLat =
    request.delivery_status === "delivering" && dummyRecipient
      ? dummyRecipient.latitude
      : realRecipientLat;
  const recipientLng =
    request.delivery_status === "delivering" && dummyRecipient
      ? dummyRecipient.longitude
      : realRecipientLng;
  const volunteerLat = request.volunteer_location?.latitude;
  const volunteerLng = request.volunteer_location?.longitude;

  const pickupPoint =
    Number.isFinite(pickupLat) && Number.isFinite(pickupLng)
      ? {
          lat: pickupLat,
          lng: pickupLng,
          title: "Pickup point",
          description: request.item_details.name,
          address: request.item_details.address,
        }
      : null;

  const recipientPoint =
    Number.isFinite(recipientLat) && Number.isFinite(recipientLng)
      ? {
          lat: recipientLat,
          lng: recipientLng,
          title: request.delivery_status === "delivering" ? "Delivery destination (simulated)" : "Recipient location",
          description:
            request.delivery_status === "delivering"
              ? "Dummy destination for live delivery simulation"
              : request.requester?.full_name || "Recipient destination",
          address: "Delivery destination",
        }
      : null;

  const courierPoint =
    Number.isFinite(volunteerLat) && Number.isFinite(volunteerLng)
      ? {
          lat: volunteerLat,
          lng: volunteerLng,
          label: "YOU",
          description: "Your live volunteer location",
        }
      : pickupPoint
        ? {
            lat: pickupPoint.lat,
            lng: pickupPoint.lng,
            label: "YOU",
            description: "Your dispatch position",
          }
      : null;

  const routePath =
    (request.delivery_status === "picked" || request.delivery_status === "delivering") && courierPoint && recipientPoint
      ? [courierPoint, recipientPoint]
      : courierPoint && pickupPoint
        ? [courierPoint, pickupPoint]
      : pickupPoint && recipientPoint && (request.delivery_status === "picked" || request.delivery_status === "delivering")
        ? [pickupPoint, recipientPoint]
        : pickupPoint
          ? [pickupPoint]
          : [];

  const locations =
    (request.delivery_status === "picked" || request.delivery_status === "delivering") && recipientPoint
      ? [recipientPoint]
      : pickupPoint
        ? [pickupPoint]
        : [];

  return {
    locations,
    routePath,
    movingMarker: courierPoint,
  };
};

const VolunteerDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const [fallbackPickupCoords, setFallbackPickupCoords] = useState<{ lat: number; lng: number } | null>(null);

  const requestsQuery = useQuery({
    queryKey: ["requests", "volunteer"],
    queryFn: () => api.getRequests("all"),
    refetchInterval: 4000,
  });

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", "volunteer"],
    queryFn: api.getDashboardSummary,
    refetchInterval: 10000,
  });

  const claimMutation = useMutation({
    mutationFn: api.claimVolunteerDelivery,
    onSuccess: () => {
      toast.success("Delivery assigned to you.");
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: number; status: DeliveryRequest["delivery_status"] }) =>
      api.updateDeliveryStatus(requestId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        api.updateVolunteerLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const logout = () => {
    clearUserSession();
    navigate("/auth?mode=login");
  };

  const requests = useMemo(
    () =>
      [...(requestsQuery.data || [])].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      ),
    [requestsQuery.data]
  );
  const freshRequests = useMemo(
    () =>
      requests.filter((request) => {
        const updatedAtMs = new Date(request.updated_at).getTime();
        if (!Number.isFinite(updatedAtMs)) {
          return false;
        }
        return Date.now() - updatedAtMs <= FRESH_VOLUNTEER_WINDOW_MS;
      }),
    [requests]
  );
  const myAssignments = freshRequests.filter((request) => request.volunteer?.id === user?.id);
  const activeAssignments = myAssignments.filter((request) => request.delivery_status !== "delivered");
  const recentAssignments = activeAssignments.slice(0, 2);
  const openRequests = freshRequests
    .filter((request) => !request.volunteer && request.delivery_status !== "delivered")
    .slice(0, 2);
  const currentRouteRequest =
    activeAssignments.find((request) => request.delivery_status === "delivering") ||
    activeAssignments.find((request) => request.delivery_status === "picked") ||
    activeAssignments[0] ||
    null;

  useEffect(() => {
    let cancelled = false;

    const hydrateFallbackPickupCoords = async () => {
      if (!currentRouteRequest) {
        setFallbackPickupCoords(null);
        return;
      }

      if (
        Number.isFinite(currentRouteRequest.item_details.latitude) &&
        Number.isFinite(currentRouteRequest.item_details.longitude)
      ) {
        setFallbackPickupCoords(null);
        return;
      }

      if (!currentRouteRequest.item_details.address) {
        setFallbackPickupCoords(null);
        return;
      }

      try {
        const result = await geocodeAddress(currentRouteRequest.item_details.address);
        if (!cancelled) {
          setFallbackPickupCoords({ lat: result.lat, lng: result.lng });
        }
      } catch {
        if (!cancelled) {
          setFallbackPickupCoords(null);
        }
      }
    };

    hydrateFallbackPickupCoords();
    return () => {
      cancelled = true;
    };
  }, [
    currentRouteRequest?.id,
    currentRouteRequest?.item_details?.address,
    currentRouteRequest?.item_details?.latitude,
    currentRouteRequest?.item_details?.longitude,
  ]);

  const routeRequestForMap = useMemo(() => {
    if (!currentRouteRequest || !fallbackPickupCoords) {
      return currentRouteRequest;
    }

    return {
      ...currentRouteRequest,
      item_details: {
        ...currentRouteRequest.item_details,
        latitude: currentRouteRequest.item_details.latitude ?? fallbackPickupCoords.lat,
        longitude: currentRouteRequest.item_details.longitude ?? fallbackPickupCoords.lng,
      },
    };
  }, [currentRouteRequest, fallbackPickupCoords]);

  const deliveryMapData = routeRequestForMap ? getDeliveryMapData(routeRequestForMap) : null;
  const hasMapData =
    Boolean(deliveryMapData?.locations?.length) ||
    Boolean(deliveryMapData?.routePath?.length) ||
    Boolean(deliveryMapData?.movingMarker);
  const summary = summaryQuery.data;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4faf8_0%,#eef4ff_100%)]">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-secondary">
              <Truck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Volunteer dispatch</p>
              <p className="text-lg font-semibold">SharePlate</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <LiveBadge label="Dispatch online" />
            <Button variant="outline" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,#0f2d47_0%,#1d496d_55%,#2f6b8f_100%)] text-white shadow-[0_28px_80px_rgba(15,45,71,0.22)]">
            <CardContent className="space-y-6 p-8">
              <Badge className="w-fit bg-white/10 text-white hover:bg-white/10">Real-time volunteer ops</Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold">Dispatch board for {user?.first_name || "Volunteer"}.</h1>
                <p className="max-w-2xl text-white/74">
                  Claim open deliveries, update milestones from pickup to drop-off, and stream location updates directly from the browser.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                  <div className="text-sm text-white/70">Open deliveries</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.open_deliveries || 0)}</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                  <div className="text-sm text-white/70">My active runs</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.my_active_deliveries || 0)}</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                  <div className="text-sm text-white/70">Completed</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.completed_deliveries || 0)}</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                  <div className="text-sm text-white/70">Refresh cadence</div>
                  <div className="mt-2 flex items-center gap-2 text-2xl font-semibold">
                    <Radio className="h-5 w-5 text-emerald-300" />
                    5s
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/88">
            <CardHeader>
              <CardDescription>
                {currentRouteRequest?.delivery_status === "picked" || currentRouteRequest?.delivery_status === "delivering"
                  ? "Blue route is focused on the recipient destination."
                  : "Blue route is focused on the pickup location."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentRouteRequest && hasMapData ? (
                <Map
                  locations={deliveryMapData?.locations || []}
                  routePath={deliveryMapData?.routePath || []}
                  movingMarker={deliveryMapData?.movingMarker || null}
                  routeColor="#2563eb"
                  routeGlowColor="#93c5fd"
                  routeDashArray={undefined}
                  center={
                    fallbackPickupCoords
                      ? { lat: fallbackPickupCoords.lat, lng: fallbackPickupCoords.lng }
                      : undefined
                  }
                  height="320px"
                />
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  Claim a delivery to open the navigation map. Location appears as soon as pickup coordinates are available.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-white/70 bg-white/90">
            <CardHeader>
              <CardTitle>My delivery queue</CardTitle>
              <CardDescription>Advance assigned deliveries through each milestone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentAssignments.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  No active deliveries. Completed ones are automatically cleared from this panel.
                </p>
              ) : (
                recentAssignments.map((request) => {
                  const nextState = nextDeliveryState[request.delivery_status];
                  return (
                    <div key={request.id} className="rounded-3xl border border-border/80 bg-background/80 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold">{request.item_details.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            For {request.requester?.full_name || request.requester?.email}
                          </p>
                        </div>
                        <Badge variant={request.delivery_status === "delivered" ? "secondary" : "outline"}>
                          {request.delivery_status}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          {request.delivery_status === "delivering" && request.recipient_location
                            ? "Highlighted route to recipient"
                            : request.delivery_status === "picked" && request.recipient_location
                              ? "Recipient destination highlighted"
                              : request.delivery_status === "assigned"
                              ? "Highlighted route to pickup"
                              : request.item_details.address}
                        </div>
                        <div className="flex items-center gap-2">
                          <Route className="h-4 w-4 text-primary" />
                          {request.item_details.quantity} portions
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-primary" />
                          Updated {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
                        </div>
                      </div>
                      {nextState && (
                        <Button
                          className="mt-4"
                          onClick={() => statusMutation.mutate({ requestId: request.id, status: nextState })}
                          disabled={statusMutation.isPending}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Mark as {nextState}
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/90">
            <CardHeader>
              <CardTitle>Open dispatch feed</CardTitle>
              <CardDescription>Accepted claims waiting for a volunteer assignment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {openRequests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  No open deliveries at the moment.
                </p>
              ) : (
                openRequests.map((request) => (
                  <div key={request.id} className="rounded-3xl border border-border/80 bg-background/80 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold">{request.item_details.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Recipient: {request.requester?.full_name || request.requester?.email}
                        </p>
                      </div>
                      <Badge variant="outline">Awaiting volunteer</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {request.item_details.address}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-primary" />
                        Claimed {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <Button className="mt-4" variant="hero" onClick={() => claimMutation.mutate(request.id)} disabled={claimMutation.isPending}>
                      Claim delivery
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default VolunteerDashboard;
