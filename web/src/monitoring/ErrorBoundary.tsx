import {Component, type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {useEffect} from 'react';
import {captureRender,recordNavigation} from './runtime';
export class MonitoringErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error){captureRender(error);}
  render(){return this.state.failed?<main role="alert"><p>页面暂时无法显示，请重新进入。</p><a href="/login">返回登录 / Return to login</a></main>:this.props.children;}
}
export function MonitoringNavigation(){
  const {pathname}=useLocation();
  useEffect(()=>{recordNavigation(pathname);},[pathname]);
  return null;
}
