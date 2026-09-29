import {
  authCopy,
  centersCopy,
  corporatePathParams,
  dashboardsCopy,
  guardScreen,
  navScreenOf,
  sectionOfScreen,
  visibleNavigation,
  type OpportunityKind,
  type DashboardDrillTarget,
  type PnlDrillQuery,
  type Screen,
} from "@meguiars/domain";
import { colors } from "@meguiars/ui-tokens";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { AgendaScreen } from "@/screens/AgendaScreen";
import { AppointmentDetailScreen } from "@/screens/AppointmentDetailScreen";
import { AppointmentNewScreen } from "@/screens/AppointmentNewScreen";
import { CatalogDetailScreen } from "@/screens/CatalogDetailScreen";
import { CatalogNewScreen } from "@/screens/CatalogNewScreen";
import { AlertDetailScreen, AlertRulesScreen, AlertsScreen } from "@/screens/AlertsScreen";
import { CorporateDrillScreen } from "@/screens/CorporateDrillScreen";
import { CatalogScreen } from "@/screens/CatalogScreen";
import { ClientDetailScreen } from "@/screens/ClientDetailScreen";
import { ClientNewScreen } from "@/screens/ClientNewScreen";
import { ClientsScreen } from "@/screens/ClientsScreen";
import { DayScreen, FinanceSummaryScreen } from "@/screens/DayScreen";
import { DesignSystemScreen } from "@/screens/DesignSystemScreen";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { DashboardsScreen } from "@/screens/DashboardsScreen";
import { DireccionScreen } from "@/screens/DireccionScreen";
import { KpisScreen } from "@/screens/KpisScreen";
import { ForgotPasswordScreen } from "@/screens/ForgotPasswordScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { MessageScreen } from "@/screens/MessageScreen";
import { ComercialScreen } from "@/screens/ComercialScreen";
import { B2bAccountNewScreen } from "@/screens/B2bAccountNewScreen";
import { B2bAccountScreen } from "@/screens/B2bAccountScreen";
import { B2bAccountsScreen } from "@/screens/B2bAccountsScreen";
import { B2bAgreementScreen } from "@/screens/B2bAgreementScreen";
import { B2bProfitabilityScreen } from "@/screens/B2bProfitabilityScreen";
import { CrmCustomerScreen } from "@/screens/CrmCustomerScreen";
import { UpsellScreen } from "@/screens/UpsellScreen";
import { OpportunityNewScreen } from "@/screens/OpportunityNewScreen";
import { OpportunityScreen } from "@/screens/OpportunityScreen";
import { PipelineMetricsScreen } from "@/screens/PipelineMetricsScreen";
import { PipelineScreen } from "@/screens/PipelineScreen";
import { CrmCustomersScreen } from "@/screens/CrmCustomersScreen";
import { CrmTasksScreen } from "@/screens/CrmTasksScreen";
import { MembershipDetailScreen } from "@/screens/MembershipDetailScreen";
import { MembershipNewScreen } from "@/screens/MembershipNewScreen";
import { MembershipPlanScreen, MembershipPlansScreen } from "@/screens/MembershipPlansScreen";
import { MembershipsScreen } from "@/screens/MembershipsScreen";
import { OrderDetailScreen } from "@/screens/OrderDetailScreen";
import { CashScreen } from "@/screens/CashScreen";
import { ReceiptScreen } from "@/screens/ReceiptScreen";
import { ExpensesScreen } from "@/screens/ExpensesScreen";
import { ExpenseNewScreen } from "@/screens/ExpenseNewScreen";
import { ExpenseScreen } from "@/screens/ExpenseScreen";
import { ExpenseSettingsScreen } from "@/screens/ExpenseSettingsScreen";
import { PnlScreen } from "@/screens/PnlScreen";
import { PnlDrillScreen } from "@/screens/PnlDrillScreen";
import { CashSessionsScreen } from "@/screens/CashSessionsScreen";
import { CashSessionScreen } from "@/screens/CashSessionScreen";
import { ReceivableAccountScreen } from "@/screens/ReceivableAccountScreen";
import { ReceivableDocumentScreen } from "@/screens/ReceivableDocumentScreen";
import { ReceivablesScreen } from "@/screens/ReceivablesScreen";
import { OrderExecutionScreen } from "@/screens/OrderExecutionScreen";
import { OrderNewScreen } from "@/screens/OrderNewScreen";
import { OrdersScreen } from "@/screens/OrdersScreen";
import { ResetPasswordScreen } from "@/screens/ResetPasswordScreen";
import { SelectCenterScreen } from "@/screens/SelectCenterScreen";
import { SuppliesScreen } from "@/screens/SuppliesScreen";
import { TeamScreen } from "@/screens/TeamScreen";
import { UsersScreen } from "@/screens/UsersScreen";
import { AppHeader, SubNav, TabBar } from "@/ui/layout";

/**
 * Navegación nativa por pestañas. Las pestañas y los guards salen de
 * @meguiars/domain (visibleNavigation / SCREEN_GUARDS), igual que la web.
 */
export function Router() {
  const { client, state, recovery, signOut, dismissDisabled } = useAuth();
  const [screen, setScreen] = useState<Screen>("home");
  // Parámetro de la pantalla de detalle (equivale a /clientes/[id] en web).
  const [clientId, setClientId] = useState<string | null>(null);
  const openClient = (id: string) => {
    setClientId(id);
    setScreen("clientDetail");
  };
  // Parámetros de la agenda (equivalen a /agenda/[id] y /agenda/nueva?walkin=1&dia= en web).
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [newAppointment, setNewAppointment] = useState({ walkIn: false, day: "" });
  const openAppointment = (id: string) => {
    setAppointmentId(id);
    setScreen("appointmentDetail");
  };
  // Parámetro del detalle de servicio (equivale a /catalogo/[id] en web).
  const [serviceId, setServiceId] = useState<string | null>(null);
  const openService = (id: string) => {
    setServiceId(id);
    setScreen("catalogDetail");
  };
  // Parámetro del detalle de OS (equivale a /ordenes/[id] en web).
  const [orderId, setOrderId] = useState<string | null>(null);
  const openOrder = (id: string) => {
    setOrderId(id);
    setScreen("orderDetail");
  };
  // Parámetros de membresías (equivalen a /comercial/membresias/[id] y /comercial/planes/[id] en web).
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const openMembership = (id: string) => {
    setMembershipId(id);
    setScreen("membershipDetail");
  };
  const [planId, setPlanId] = useState<string | null>(null);
  const openPlan = (id: string) => {
    setPlanId(id);
    setScreen("membershipPlanDetail");
  };
  // Parámetro de la ficha comercial (equivale a /comercial/clientes/[id] en web).
  const [crmClientId, setCrmClientId] = useState<string | null>(null);
  const openCrmCustomer = (id: string) => {
    setCrmClientId(id);
    setScreen("crmCustomerDetail");
  };
  // Parámetros B2B (equivalen a /comercial/b2b/[id] y /comercial/b2b/convenios/[id] en web).
  const [b2bAccountId, setB2bAccountId] = useState<string | null>(null);
  const openB2bAccount = (id: string) => {
    setB2bAccountId(id);
    setScreen("b2bAccountDetail");
  };
  const [b2bAgreementId, setB2bAgreementId] = useState<string | null>(null);
  const openB2bAgreement = (id: string) => {
    setB2bAgreementId(id);
    setScreen("b2bAgreementDetail");
  };
  // Parámetros del pipeline (equivalen a /comercial/pipeline/[id] y /nueva?tipo=&cliente=&cuenta= en web).
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const openOpportunity = (id: string) => {
    setOpportunityId(id);
    setScreen("opportunityDetail");
  };
  const [newOpportunity, setNewOpportunity] = useState<{
    kind?: OpportunityKind;
    clientId?: string;
    accountId?: string;
  }>({});
  const startOpportunity = (
    defaults: { kind?: OpportunityKind; clientId?: string; accountId?: string } = {},
  ) => {
    setNewOpportunity(defaults);
    setScreen("opportunityNew");
  };
  // Parámetro del recibo (equivale a /finanzas/cobranza/recibos/[id] en web) y a dónde volver.
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptBack, setReceiptBack] = useState<Screen>("payments");
  const openReceipt = (id: string, from: Screen) => {
    setReceiptId(id);
    setReceiptBack(from);
    setScreen("paymentReceipt");
  };
  // Parámetro del egreso (equivale a /finanzas/egresos/[id] en web).
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const openExpense = (id: string) => {
    setExpenseId(id);
    setScreen("expenseDetail");
  };
  // Parámetros del drill-down del P&L (equivalen a /finanzas/resultados/detalle en web).
  const [pnlDrill, setPnlDrill] = useState<PnlDrillQuery | null>(null);
  const openPnlDrill = (query: PnlDrillQuery) => {
    setPnlDrill(query);
    setScreen("pnlDrilldown");
  };
  // Parámetro del corte de caja (equivale a /finanzas/caja/[id] en web).
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  const openCashSession = (id: string) => {
    setCashSessionId(id);
    setScreen("cashSession");
  };
  // Cuentas por cobrar B2B (equivalen a /finanzas/cxc/cuentas/[id] y /documentos/[id]).
  const [receivableAccountId, setReceivableAccountId] = useState<string | null>(null);
  const openReceivableAccount = (id: string) => {
    setReceivableAccountId(id);
    setScreen("receivableAccount");
  };
  const [receivableDocumentId, setReceivableDocumentId] = useState<string | null>(null);
  const openReceivableDocument = (id: string) => {
    setReceivableDocumentId(id);
    setScreen("receivableDocument");
  };
  // Tablero (equivale a /direccion/tableros/[id] en web) y su drill-down.
  // Tablero corporativo (D3): filtros del tablero y posición del drill-down
  // (mismos parámetros que /direccion y /direccion/detalle en web).
  const [corporateParams, setCorporateParams] = useState<Record<string, string | undefined>>({});
  const [corporateDrill, setCorporateDrill] = useState<Record<string, string> | null>(null);
  const openCorporateDrill = (params: Record<string, string>) => {
    setCorporateDrill(params);
    setScreen("direccionDetalle");
  };
  // Alertas (D4): detalle y enlaces al KPI (equivalen a /direccion/alertas/[id] y /direccion/kpis?…).
  const [alertId, setAlertId] = useState<string | null>(null);
  const openAlert = (id: string) => {
    setAlertId(id);
    setScreen("alertDetail");
  };
  const [kpiParams, setKpiParams] = useState<Record<string, string> | undefined>(undefined);
  const openKpis = (params: Record<string, string>) => {
    setKpiParams(params);
    setScreen("kpis");
  };
  /** Navegación desde el menú: pantallas sin filtros heredados de un enlace. */
  const selectScreen = (next: Screen) => {
    setKpiParams(undefined);
    setScreen(next);
  };
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const openDashboard = (id: string) => {
    setDashboardId(id);
    setScreen("dashboardDetail");
  };
  const drillFromDashboard = (target: DashboardDrillTarget) =>
    target.screen === "pnlDrilldown" ? openPnlDrill(target.query) : setScreen(target.screen);
  const [publicScreen, setPublicScreen] = useState<"login" | "forgot">("login");
  const goHome = () => setScreen("home");

  if (!client)
    return <MessageScreen title={authCopy.loginTitle} message={centersCopy.notConfigured} tone="danger" />;
  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} accessibilityLabel="Cargando" />
      </View>
    );
  }
  if (recovery && state.status === "signed_in") return <ResetPasswordScreen />;
  if (state.status === "disabled") {
    return (
      <MessageScreen
        title={authCopy.disabledTitle}
        message={authCopy.disabled}
        tone="danger"
        action={{ label: authCopy.backToLogin, onPress: dismissDisabled }}
      />
    );
  }
  if (state.status === "signed_out") {
    return publicScreen === "login" ? (
      <LoginScreen onForgot={() => setPublicScreen("forgot")} />
    ) : (
      <ForgotPasswordScreen onBack={() => setPublicScreen("login")} />
    );
  }

  const guard = guardScreen(state, screen);
  if (!guard.allow && guard.redirect === "select_center")
    return <SelectCenterScreen state={state} onDone={goHome} />;
  if (!guard.allow && guard.redirect === "no_centers") {
    return (
      <MessageScreen
        title={authCopy.noCentersTitle}
        message={authCopy.noCenters}
        action={{ label: authCopy.logout, onPress: () => void signOut() }}
      />
    );
  }
  if (screen === "selectCenter") return <SelectCenterScreen state={state} onDone={goHome} />;

  const sections = visibleNavigation(state);
  const sectionId = sectionOfScreen(screen);
  const header = (
    <AppHeader
      state={state}
      onChangeCenter={() => setScreen("selectCenter")}
      onDesignSystem={() => setScreen("designSystem")}
    />
  );
  const subnav = (
    <SubNav
      section={sections.find((s) => s.id === sectionId)}
      current={navScreenOf(screen)}
      onSelect={selectScreen}
    />
  );
  const props = { state, header, subnav };

  let content: React.ReactNode;
  if (!guard.allow) {
    content = (
      <MessageScreen
        header={header}
        title={authCopy.forbiddenTitle}
        message={authCopy.forbidden}
        action={{ label: "Ir al inicio", onPress: goHome }}
      />
    );
  } else {
    switch (screen) {
      case "comercial":
        content = (
          <ComercialScreen
            {...props}
            onMemberships={() => setScreen("memberships")}
            onCrm={() => setScreen("crmCustomers")}
            onTasks={() => setScreen("crmTasks")}
            onB2b={() => setScreen("b2bAccounts")}
            onUpsell={() => setScreen("upsell")}
            onPipeline={() => setScreen("pipeline")}
          />
        );
        break;
      case "b2bAccounts":
        content = (
          <B2bAccountsScreen
            {...props}
            onOpen={openB2bAccount}
            onNew={() => setScreen("b2bAccountNew")}
            onProfitability={() => setScreen("b2bProfitability")}
          />
        );
        break;
      case "b2bAccountNew":
        content = (
          <B2bAccountNewScreen {...props} onOpen={openB2bAccount} onCancel={() => setScreen("b2bAccounts")} />
        );
        break;
      case "b2bAccountDetail":
        content = b2bAccountId ? (
          <B2bAccountScreen
            key={b2bAccountId}
            {...props}
            accountId={b2bAccountId}
            onBack={() => setScreen("b2bAccounts")}
            onOpenAgreement={openB2bAgreement}
            onNewOpportunity={(accountId) => startOpportunity({ kind: "b2b", accountId })}
            onOpenReceivables={openReceivableAccount}
          />
        ) : (
          <B2bAccountsScreen
            {...props}
            onOpen={openB2bAccount}
            onNew={() => setScreen("b2bAccountNew")}
            onProfitability={() => setScreen("b2bProfitability")}
          />
        );
        break;
      case "b2bAgreementDetail":
        content = b2bAgreementId ? (
          <B2bAgreementScreen
            key={b2bAgreementId}
            {...props}
            agreementId={b2bAgreementId}
            onBack={(accountId) => (accountId ? openB2bAccount(accountId) : setScreen("b2bAccounts"))}
          />
        ) : (
          <B2bAccountsScreen
            {...props}
            onOpen={openB2bAccount}
            onNew={() => setScreen("b2bAccountNew")}
            onProfitability={() => setScreen("b2bProfitability")}
          />
        );
        break;
      case "upsell":
        content = <UpsellScreen {...props} />;
        break;
      case "pipeline":
        content = (
          <PipelineScreen
            {...props}
            onOpen={openOpportunity}
            onNew={() => startOpportunity()}
            onMetrics={() => setScreen("pipelineMetrics")}
          />
        );
        break;
      case "opportunityNew":
        content = (
          <OpportunityNewScreen
            {...props}
            defaults={newOpportunity}
            onCreated={openOpportunity}
            onCancel={() => setScreen("pipeline")}
          />
        );
        break;
      case "opportunityDetail":
        content = opportunityId ? (
          <OpportunityScreen
            key={opportunityId}
            {...props}
            opportunityId={opportunityId}
            onBack={() => setScreen("pipeline")}
            onOpenAccount={openB2bAccount}
          />
        ) : (
          <PipelineScreen
            {...props}
            onOpen={openOpportunity}
            onNew={() => startOpportunity()}
            onMetrics={() => setScreen("pipelineMetrics")}
          />
        );
        break;
      case "pipelineMetrics":
        content = <PipelineMetricsScreen {...props} />;
        break;
      case "b2bProfitability":
        content = <B2bProfitabilityScreen {...props} onOpen={openB2bAccount} />;
        break;
      case "crmCustomers":
        content = (
          <CrmCustomersScreen {...props} onOpen={openCrmCustomer} onTasks={() => setScreen("crmTasks")} />
        );
        break;
      case "crmCustomerDetail":
        content = crmClientId ? (
          <CrmCustomerScreen
            key={crmClientId}
            {...props}
            clientId={crmClientId}
            onBack={() => setScreen("crmCustomers")}
            onNewOpportunity={(clientId) => startOpportunity({ kind: "b2c_premium", clientId })}
          />
        ) : (
          <CrmCustomersScreen {...props} onOpen={openCrmCustomer} onTasks={() => setScreen("crmTasks")} />
        );
        break;
      case "crmTasks":
        content = <CrmTasksScreen {...props} onOpenClient={openCrmCustomer} />;
        break;
      case "memberships":
        content = (
          <MembershipsScreen
            {...props}
            onOpen={openMembership}
            onNew={() => setScreen("membershipNew")}
            onPlans={() => setScreen("membershipPlans")}
          />
        );
        break;
      case "membershipNew":
        content = (
          <MembershipNewScreen {...props} onOpen={openMembership} onCancel={() => setScreen("memberships")} />
        );
        break;
      case "membershipDetail":
        content = membershipId ? (
          <MembershipDetailScreen
            key={membershipId}
            {...props}
            membershipId={membershipId}
            onBack={() => setScreen("memberships")}
          />
        ) : (
          <MembershipsScreen
            {...props}
            onOpen={openMembership}
            onNew={() => setScreen("membershipNew")}
            onPlans={() => setScreen("membershipPlans")}
          />
        );
        break;
      case "membershipPlans":
        content = (
          <MembershipPlansScreen {...props} onOpen={openPlan} onBack={() => setScreen("memberships")} />
        );
        break;
      case "membershipPlanDetail":
        content = planId ? (
          <MembershipPlanScreen
            key={planId}
            {...props}
            planId={planId}
            onBack={() => setScreen("membershipPlans")}
          />
        ) : (
          <MembershipPlansScreen {...props} onOpen={openPlan} onBack={() => setScreen("memberships")} />
        );
        break;
      case "operacion":
        content = (
          <DayScreen
            {...props}
            onOrder={openOrder}
            onAppointment={openAppointment}
            onNewOrder={() => setScreen("orderNew")}
            onNewAppointment={() => {
              setNewAppointment({ walkIn: false, day: "" });
              setScreen("appointmentNew");
            }}
          />
        );
        break;
      case "finanzas":
        content = <FinanceSummaryScreen {...props} onNavigate={setScreen} />;
        break;
      case "direccion":
        content = (
          <DireccionScreen
            {...props}
            params={corporateParams}
            onParams={setCorporateParams}
            onDrill={(path, filterParams) =>
              openCorporateDrill({ ...filterParams, ...corporatePathParams(path) })
            }
          />
        );
        break;
      case "direccionDetalle":
        content = corporateDrill ? (
          <CorporateDrillScreen
            key={JSON.stringify(corporateDrill)}
            {...props}
            params={corporateDrill}
            onNavigate={openCorporateDrill}
            onBack={() => setScreen("direccion")}
            onPnl={drillFromDashboard}
          />
        ) : (
          <DireccionScreen
            {...props}
            params={corporateParams}
            onParams={setCorporateParams}
            onDrill={(path, filterParams) =>
              openCorporateDrill({ ...filterParams, ...corporatePathParams(path) })
            }
          />
        );
        break;
      case "dashboards":
        content = <DashboardsScreen {...props} onOpen={openDashboard} />;
        break;
      case "kpis":
        content = (
          <KpisScreen
            key={JSON.stringify(kpiParams ?? {})}
            {...props}
            onDrill={drillFromDashboard}
            initialParams={kpiParams}
          />
        );
        break;
      case "alerts":
        content = (
          <AlertsScreen
            {...props}
            onOpen={openAlert}
            onRules={() => setScreen("alertRules")}
            onKpis={openKpis}
            onDrill={openCorporateDrill}
          />
        );
        break;
      case "alertDetail":
        content = alertId ? (
          <AlertDetailScreen
            key={alertId}
            {...props}
            alertId={alertId}
            onBack={() => setScreen("alerts")}
            onKpis={openKpis}
            onDrill={openCorporateDrill}
          />
        ) : (
          <AlertsScreen
            {...props}
            onOpen={openAlert}
            onRules={() => setScreen("alertRules")}
            onKpis={openKpis}
            onDrill={openCorporateDrill}
          />
        );
        break;
      case "alertRules":
        content = <AlertRulesScreen {...props} onBack={() => setScreen("alerts")} />;
        break;
      case "dashboardDetail":
        content = dashboardId ? (
          <DashboardScreen
            key={dashboardId}
            {...props}
            dashboardId={dashboardId}
            onBack={() => setScreen("dashboards")}
            onDrill={drillFromDashboard}
          />
        ) : (
          <DashboardsScreen {...props} onOpen={openDashboard} />
        );
        break;
      case "dashboardNew":
      case "dashboardEdit":
        // El constructor (arrastrar y redimensionar) es de la web; en móvil se consultan y ajustan.
        content = (
          <MessageScreen
            header={header}
            title={dashboardsCopy.builderTitle}
            message="El constructor de tableros está en la web. En móvil puedes consultarlos y ajustar tu vista."
            action={{ label: dashboardsCopy.title, onPress: () => setScreen("dashboards") }}
          />
        );
        break;
      case "clients":
        content = <ClientsScreen {...props} onOpen={openClient} onNew={() => setScreen("clientNew")} />;
        break;
      case "agenda":
        content = (
          <AgendaScreen
            {...props}
            onOpen={openAppointment}
            onNew={(walkIn, day) => {
              setNewAppointment({ walkIn, day });
              setScreen("appointmentNew");
            }}
          />
        );
        break;
      case "appointmentNew":
        content = (
          <AppointmentNewScreen
            {...props}
            walkIn={newAppointment.walkIn}
            day={newAppointment.day}
            onOpen={openAppointment}
            onCancel={() => setScreen("agenda")}
          />
        );
        break;
      case "appointmentDetail":
        content = appointmentId ? (
          <AppointmentDetailScreen
            key={appointmentId}
            {...props}
            appointmentId={appointmentId}
            onBack={() => setScreen("agenda")}
            onOpenOrder={openOrder}
          />
        ) : (
          <AgendaScreen {...props} onOpen={openAppointment} onNew={() => setScreen("appointmentNew")} />
        );
        break;
      case "orders":
        content = <OrdersScreen {...props} onOpen={openOrder} onNew={() => setScreen("orderNew")} />;
        break;
      case "orderNew":
        content = <OrderNewScreen {...props} onOpen={openOrder} onCancel={() => setScreen("orders")} />;
        break;
      case "orderDetail":
        content = orderId ? (
          <OrderDetailScreen
            key={orderId}
            {...props}
            orderId={orderId}
            onBack={() => setScreen("orders")}
            onExecution={() => setScreen("orderExecution")}
            onNewMembership={() => setScreen("membershipNew")}
            onOpenReceipt={(id) => openReceipt(id, "orderDetail")}
          />
        ) : (
          <OrdersScreen {...props} onOpen={openOrder} onNew={() => setScreen("orderNew")} />
        );
        break;
      case "payments":
        content = <CashScreen {...props} onOpenReceipt={(id) => openReceipt(id, "payments")} />;
        break;
      case "expenses":
        content = (
          <ExpensesScreen
            {...props}
            onOpen={openExpense}
            onNew={() => setScreen("expenseNew")}
            onSettings={() => setScreen("expenseSettings")}
          />
        );
        break;
      case "expenseNew":
        content = (
          <ExpenseNewScreen {...props} onCreated={openExpense} onCancel={() => setScreen("expenses")} />
        );
        break;
      case "expenseDetail":
        content = expenseId ? (
          <ExpenseScreen
            key={expenseId}
            {...props}
            expenseId={expenseId}
            onBack={() => setScreen("expenses")}
          />
        ) : (
          <ExpensesScreen
            {...props}
            onOpen={openExpense}
            onNew={() => setScreen("expenseNew")}
            onSettings={() => setScreen("expenseSettings")}
          />
        );
        break;
      case "expenseSettings":
        content = <ExpenseSettingsScreen {...props} onBack={() => setScreen("expenses")} />;
        break;
      case "pnl":
        content = <PnlScreen {...props} onDrill={openPnlDrill} />;
        break;
      case "pnlDrilldown":
        content = pnlDrill ? (
          <PnlDrillScreen
            {...props}
            query={pnlDrill}
            onBack={() => setScreen("pnl")}
            onOpen={(target, id) =>
              target === "orderDetail"
                ? openOrder(id)
                : target === "membershipDetail"
                  ? openMembership(id)
                  : target === "b2bAgreementDetail"
                    ? openB2bAgreement(id)
                    : openExpense(id)
            }
          />
        ) : (
          <PnlScreen {...props} onDrill={openPnlDrill} />
        );
        break;
      case "receivables":
        content = (
          <ReceivablesScreen
            {...props}
            onOpenAccount={openReceivableAccount}
            onOpenDocument={openReceivableDocument}
          />
        );
        break;
      case "receivableAccount":
        content = receivableAccountId ? (
          <ReceivableAccountScreen
            key={receivableAccountId}
            {...props}
            accountId={receivableAccountId}
            onBack={() => setScreen("receivables")}
            onOpenDocument={openReceivableDocument}
            onOpenB2bAccount={guardScreen(state, "b2bAccountDetail").allow ? openB2bAccount : undefined}
          />
        ) : (
          <ReceivablesScreen
            {...props}
            onOpenAccount={openReceivableAccount}
            onOpenDocument={openReceivableDocument}
          />
        );
        break;
      case "receivableDocument":
        content = receivableDocumentId ? (
          <ReceivableDocumentScreen
            key={receivableDocumentId}
            {...props}
            documentId={receivableDocumentId}
            onBack={(accountId) => (accountId ? openReceivableAccount(accountId) : setScreen("receivables"))}
          />
        ) : (
          <ReceivablesScreen
            {...props}
            onOpenAccount={openReceivableAccount}
            onOpenDocument={openReceivableDocument}
          />
        );
        break;
      case "cash":
        content = <CashSessionsScreen {...props} onOpen={openCashSession} />;
        break;
      case "cashSession":
        content = cashSessionId ? (
          <CashSessionScreen
            key={cashSessionId}
            {...props}
            sessionId={cashSessionId}
            onBack={() => setScreen("cash")}
          />
        ) : (
          <CashSessionsScreen {...props} onOpen={openCashSession} />
        );
        break;
      case "paymentReceipt":
        content = receiptId ? (
          <ReceiptScreen
            key={receiptId}
            {...props}
            paymentId={receiptId}
            onBack={() => setScreen(receiptBack)}
          />
        ) : (
          <CashScreen {...props} onOpenReceipt={(id) => openReceipt(id, "payments")} />
        );
        break;
      case "orderExecution":
        content = orderId ? (
          <OrderExecutionScreen
            key={orderId}
            {...props}
            orderId={orderId}
            onBack={() => setScreen("orderDetail")}
          />
        ) : (
          <OrdersScreen {...props} onOpen={openOrder} onNew={() => setScreen("orderNew")} />
        );
        break;
      case "supplies":
        content = <SuppliesScreen {...props} onBack={() => setScreen("catalog")} />;
        break;
      case "catalog":
        content = (
          <CatalogScreen
            {...props}
            onOpen={openService}
            onNew={() => setScreen("catalogNew")}
            onSupplies={() => setScreen("supplies")}
          />
        );
        break;
      case "catalogNew":
        content = <CatalogNewScreen {...props} onOpen={openService} onCancel={() => setScreen("catalog")} />;
        break;
      case "catalogDetail":
        content = serviceId ? (
          <CatalogDetailScreen
            key={serviceId}
            {...props}
            serviceId={serviceId}
            onBack={() => setScreen("catalog")}
          />
        ) : (
          <CatalogScreen
            {...props}
            onOpen={openService}
            onNew={() => setScreen("catalogNew")}
            onSupplies={() => setScreen("supplies")}
          />
        );
        break;
      case "clientNew":
        content = <ClientNewScreen {...props} onOpen={openClient} onCancel={() => setScreen("clients")} />;
        break;
      case "clientDetail":
        content = clientId ? (
          <ClientDetailScreen
            key={clientId}
            {...props}
            clientId={clientId}
            onBack={() => setScreen("clients")}
            onCrm={openCrmCustomer}
          />
        ) : (
          <ClientsScreen {...props} onOpen={openClient} onNew={() => setScreen("clientNew")} />
        );
        break;
      case "team":
        content = <TeamScreen {...props} />;
        break;
      case "users":
      case "userDetail":
        content = <UsersScreen {...props} />;
        break;
      case "designSystem":
        content = <DesignSystemScreen {...props} />;
        break;
      default:
        content = <HomeScreen {...props} />;
    }
  }

  // key = centro activo: al cambiar de centro se descarta el estado de la pantalla anterior.
  return (
    <View style={styles.fill}>
      <View key={state.activeCenterId ?? "none"} style={styles.fill}>
        {content}
      </View>
      <TabBar sections={sections} active={sectionId} onSelect={selectScreen} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", backgroundColor: colors.background },
});
